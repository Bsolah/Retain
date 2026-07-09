import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  ProgressBar,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  cutoverMigration,
  discoverMigration,
  fetchMigrationErrors,
  fetchMigrations,
  rollbackMigration,
  startMigrationSync,
  subscribeMigrationProgress,
  updateCommunicationTemplate,
  validateMigration,
} from '../lib/migration-api';
import type {
  CommunicationTemplate,
  MigrationPlatform,
  MigrationProgress,
  MigrationRow,
  MigrationStatus,
} from '../types/migrations';

const PLATFORMS: Array<{ label: string; value: MigrationPlatform }> = [
  { label: 'Recharge', value: 'recharge' },
  { label: 'Shopify Subscriptions', value: 'shopify_subscriptions' },
  { label: 'Bold Subscriptions', value: 'bold' },
  { label: 'Appstle', value: 'appstle' },
  { label: 'Smartrr', value: 'smartrr' },
  { label: 'CSV upload', value: 'csv' },
];

const STATUS_TONE: Record<
  MigrationStatus,
  'success' | 'info' | 'warning' | 'critical' | 'attention'
> = {
  discovered: 'info',
  syncing: 'attention',
  validated: 'info',
  cutover: 'attention',
  completed: 'success',
  rolled_back: 'warning',
  failed: 'critical',
};

export function MigrationsPage() {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<MigrationPlatform>('recharge');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [csvData, setCsvData] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [cancelSource, setCancelSource] = useState(false);
  const [liveProgress, setLiveProgress] = useState<MigrationProgress | null>(
    null,
  );
  const [templateDraft, setTemplateDraft] = useState<CommunicationTemplate>({
    subject: 'Your subscription is moving to a better experience',
    bodyHtml:
      '<p>Hi {{customer.firstName}}, your subscription at {{shop.name}} is being upgraded.</p>',
    bodyText:
      'Hi {{customer.firstName}}, your subscription at {{shop.name}} is being upgraded.',
  });

  const migrationsQuery = useQuery({
    queryKey: ['migrations'],
    queryFn: fetchMigrations,
    refetchInterval: 10_000,
  });

  const selected = useMemo(
    () => migrationsQuery.data?.find((m) => m.id === selectedId) ?? null,
    [migrationsQuery.data, selectedId],
  );

  const errorsQuery = useQuery({
    queryKey: ['migration-errors', selectedId],
    queryFn: () => fetchMigrationErrors(selectedId!),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!selectedId || !selected || selected.status !== 'syncing') {
      setLiveProgress(null);
      return;
    }
    return subscribeMigrationProgress(selectedId, setLiveProgress);
  }, [selectedId, selected?.status]);

  useEffect(() => {
    if (selected?.communicationTemplate) {
      setTemplateDraft(selected.communicationTemplate);
    }
  }, [selected?.communicationTemplate, selectedId]);

  const discoverMutation = useMutation({
    mutationFn: () =>
      discoverMigration({
        platform,
        apiKey: apiKey || undefined,
        apiSecret: apiSecret || undefined,
        csvData: platform === 'csv' ? csvData : undefined,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['migrations'] });
      setSelectedId(result.migrationId);
    },
  });

  const syncMutation = useMutation({
    mutationFn: (migrationId: string) => startMigrationSync(migrationId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['migrations'] }),
  });

  const needsSync =
    selected != null &&
    (selected.status === 'discovered' ||
      selected.status === 'failed' ||
      (selected.validationReport != null &&
        !selected.validationReport.passed &&
        selected.validationReport.syncedContractCount <
          selected.validationReport.sourceContractCount));

  const canValidate =
    selected != null &&
    !needsSync &&
    selected.status === 'validated' &&
    (selected.progress?.total ?? 0) > 0;

  const validateMutation = useMutation({
    mutationFn: (migrationId: string) => validateMigration(migrationId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['migrations'] }),
  });

  const cutoverMutation = useMutation({
    mutationFn: (migrationId: string) =>
      cutoverMigration(migrationId, cancelSource),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['migrations'] }),
  });

  const rollbackMutation = useMutation({
    mutationFn: (migrationId: string) => rollbackMigration(migrationId),
    onSuccess: () => {
      setRollbackOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['migrations'] });
    },
  });

  const templateMutation = useMutation({
    mutationFn: () => updateCommunicationTemplate(selectedId!, templateDraft),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['migrations'] }),
  });

  const progress = liveProgress ?? selected?.progress ?? {};
  const percent = progress.percent ?? 0;

  return (
    <Page
      title="Subscription migrations"
      subtitle="Move subscribers from Recharge, Bold, Appstle, and other platforms with zero downtime."
    >
      <BlockStack gap="500">
        <Banner tone="info">
          <p>
            <strong>Zero-downtime workflow:</strong> discover your existing
            subscribers, sync them into Retain, validate the data, then cut over
            billing on the next charge date. You can roll back within 48 hours
            if needed.
          </p>
        </Banner>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Step 1 — Discover
            </Text>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
              <Select
                label="Source platform"
                options={PLATFORMS}
                value={platform}
                onChange={(value) => setPlatform(value as MigrationPlatform)}
              />
              {platform !== 'csv' && platform !== 'shopify_subscriptions' ? (
                <>
                  <TextField
                    label="API key"
                    value={apiKey}
                    onChange={setApiKey}
                    autoComplete="off"
                  />
                  <TextField
                    label="API secret"
                    value={apiSecret}
                    onChange={setApiSecret}
                    autoComplete="off"
                  />
                </>
              ) : null}
            </InlineGrid>
            {platform === 'csv' ? (
              <TextField
                label="CSV data"
                value={csvData}
                onChange={setCsvData}
                multiline={6}
                helpText="Headers: email, subscription_id, product_title, price, next_billing_date, status"
                autoComplete="off"
              />
            ) : null}
            <Button
              variant="primary"
              loading={discoverMutation.isPending}
              onClick={() => discoverMutation.mutate()}
            >
              Run discovery
            </Button>
            {discoverMutation.isError ? (
              <Banner tone="critical">
                {(discoverMutation.error as Error).message}
              </Banner>
            ) : null}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Migrations
            </Text>
            {migrationsQuery.isLoading ? <Spinner /> : null}
            {migrationsQuery.data?.length === 0 ? (
              <Text as="p" tone="subdued">
                No migrations yet. Run discovery to get started.
              </Text>
            ) : null}
            {migrationsQuery.data?.map((migration) => (
              <MigrationListItem
                key={migration.id}
                migration={migration}
                selected={selectedId === migration.id}
                onSelect={() => setSelectedId(migration.id)}
              />
            ))}
          </BlockStack>
        </Card>

        {selected ? (
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Progress
                </Text>
                <ProgressBar progress={percent} size="small" />
                <Text as="p" tone="subdued">
                  {progress.currentStep ?? 'Waiting'} — {percent}% (
                  {progress.completed ?? 0}/{progress.total ?? 0} records,{' '}
                  {progress.failed ?? 0} failed)
                </Text>
                <InlineStack gap="200">
                  {needsSync ? (
                    <Button
                      variant="primary"
                      loading={syncMutation.isPending}
                      onClick={() => syncMutation.mutate(selected.id)}
                    >
                      {selected.status === 'discovered'
                        ? 'Step 2 — Start sync'
                        : 'Retry sync'}
                    </Button>
                  ) : null}
                  {canValidate ? (
                    <Button
                      loading={validateMutation.isPending}
                      onClick={() => validateMutation.mutate(selected.id)}
                    >
                      Step 3 — Validate
                    </Button>
                  ) : null}
                  {selected.status === 'validated' ? (
                    <Button
                      variant="primary"
                      loading={cutoverMutation.isPending}
                      onClick={() => cutoverMutation.mutate(selected.id)}
                    >
                      Step 4 — Cutover
                    </Button>
                  ) : null}
                  {selected.status === 'completed' ? (
                    <Button
                      tone="critical"
                      onClick={() => setRollbackOpen(true)}
                    >
                      Rollback (48h window)
                    </Button>
                  ) : null}
                </InlineStack>
                {syncMutation.isError ? (
                  <Banner tone="critical">
                    {(syncMutation.error as Error).message}
                  </Banner>
                ) : null}
                <Checkbox
                  label="Cancel subscriptions on source platform at cutover"
                  checked={cancelSource}
                  onChange={setCancelSource}
                />
              </BlockStack>
            </Card>

            {selected.validationReport ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Validation report
                  </Text>
                  <Text as="p">
                    Contracts: {selected.validationReport.syncedContractCount}/
                    {selected.validationReport.sourceContractCount} synced
                  </Text>
                  <Text as="p">
                    Status:{' '}
                    {selected.validationReport.passed
                      ? 'Passed'
                      : 'Issues found'}
                  </Text>
                  {selected.validationReport.discrepancies.map((issue) => (
                    <Banner
                      key={`${issue.code}-${issue.sourceId ?? issue.recordId}`}
                      tone={issue.severity === 'error' ? 'critical' : 'warning'}
                    >
                      {issue.message}
                    </Banner>
                  ))}
                </BlockStack>
              </Card>
            ) : null}

            {errorsQuery.data && errorsQuery.data.length > 0 ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Errors requiring attention
                  </Text>
                  {errorsQuery.data.map((error) => (
                    <Banner
                      key={error.id}
                      tone={error.requiresManualAction ? 'critical' : 'warning'}
                    >
                      <p>
                        <strong>{error.code}</strong>: {error.message}
                      </p>
                    </Banner>
                  ))}
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Customer communication template
                </Text>
                <TextField
                  label="Subject"
                  value={templateDraft.subject}
                  onChange={(value) =>
                    setTemplateDraft((prev) => ({ ...prev, subject: value }))
                  }
                  autoComplete="off"
                />
                <TextField
                  label="Body (plain text)"
                  value={templateDraft.bodyText}
                  onChange={(value) =>
                    setTemplateDraft((prev) => ({ ...prev, bodyText: value }))
                  }
                  multiline={4}
                  helpText="Variables: {{customer.firstName}}, {{shop.name}}, {{subscription.nextBillingDate}}"
                  autoComplete="off"
                />
                <TextField
                  label="Body (HTML)"
                  value={templateDraft.bodyHtml}
                  onChange={(value) =>
                    setTemplateDraft((prev) => ({ ...prev, bodyHtml: value }))
                  }
                  multiline={4}
                  autoComplete="off"
                />
                <Button
                  loading={templateMutation.isPending}
                  onClick={() => templateMutation.mutate()}
                >
                  Save template
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        ) : null}
      </BlockStack>

      <Modal
        open={rollbackOpen}
        title="Confirm rollback"
        primaryAction={{
          content: 'Rollback migration',
          destructive: true,
          loading: rollbackMutation.isPending,
          onAction: () => selected && rollbackMutation.mutate(selected.id),
        }}
        secondaryActions={[
          { content: 'Cancel', onAction: () => setRollbackOpen(false) },
        ]}
        onClose={() => setRollbackOpen(false)}
      >
        <Modal.Section>
          <Text as="p">
            This will cancel all Shopify contracts created by this migration and
            mark the migration as rolled back. Duplicate charges should be
            refunded manually. This action is only available within 48 hours of
            cutover.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function MigrationListItem({
  migration,
  selected,
  onSelect,
}: {
  migration: MigrationRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const preview = migration.preview;
  return (
    <Box
      padding="300"
      borderWidth="025"
      borderColor={selected ? 'border-emphasis' : 'border'}
      borderRadius="200"
    >
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <InlineStack gap="200">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {migration.platform}
            </Text>
            <Badge tone={STATUS_TONE[migration.status]}>
              {migration.status}
            </Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            {preview.totalContracts} contracts · {preview.totalCustomers}{' '}
            customers · ${preview.totalRevenue.toFixed(0)} revenue · ~
            {preview.estimatedDurationMinutes} min
          </Text>
        </BlockStack>
        <Button onClick={onSelect}>{selected ? 'Selected' : 'View'}</Button>
      </InlineStack>
    </Box>
  );
}
