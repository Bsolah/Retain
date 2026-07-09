import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { SubscriberDrawer } from '../components/analytics/SubscriberDrawer';
import { useBulkSubscriberAction, useSubscribers } from '../hooks/useAnalytics';
import { usePlans } from '../hooks/usePlans';
import { downloadCsv } from '../lib/analytics-api';
import type { SubscriberRow } from '../types/analytics';

const FREQUENCY_OPTIONS = [
  { label: 'All frequencies', value: '' },
  { label: 'Every 1 week', value: 'Every 1 week' },
  { label: 'Every 2 week', value: 'Every 2 week' },
  { label: 'Every 1 month', value: 'Every 1 month' },
  { label: 'Every 2 month', value: 'Every 2 month' },
];

const TABLE_GRID_COLUMNS =
  '32px minmax(0, 1.5fr) minmax(0, 0.9fr) minmax(0, 0.75fr) minmax(0, 0.6fr) minmax(0, 0.7fr) minmax(0, 0.45fr) 48px';

const cellEllipsis: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSubscriberName(row: SubscriberRow): string {
  return (
    `${row.customer.firstName ?? ''} ${row.customer.lastName ?? ''}`.trim() ||
    '—'
  );
}

export function SubscribersPage() {
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [riskLevels, setRiskLevels] = useState<string[]>([]);
  const [planId, setPlanId] = useState('');
  const [frequency, setFrequency] = useState('');
  const [nextChargeFrom, setNextChargeFrom] = useState('');
  const [nextChargeTo, setNextChargeTo] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tag, setTag] = useState('');

  const { data: plansData } = usePlans();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSubscribers({
    search,
    statuses,
    riskLevels,
    planId: planId || undefined,
    frequency: frequency || undefined,
    nextChargeFrom: nextChargeFrom || undefined,
    nextChargeTo: nextChargeTo || undefined,
    limit: 100,
  });
  const bulk = useBulkSubscriberAction();

  const subscribers = useMemo(
    () => data?.pages.flatMap((page) => page.subscribers) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: subscribers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  const allSelected =
    subscribers.length > 0 &&
    subscribers.every((row) => selected.includes(row.id));

  const toggleAll = () => {
    setSelected(allSelected ? [] : subscribers.map((row) => row.id));
  };

  const toggleOne = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const runBulk = (action: string) => {
    if (selected.length === 0) return;
    bulk.mutate({
      contractIds: selected,
      action,
      durationDays: 30,
      reason: 'merchant_bulk_cancel',
      tag: tag || undefined,
    });
  };

  const planOptions = [
    { label: 'All plans', value: '' },
    ...(plansData?.map((plan) => ({ label: plan.name, value: plan.id })) ?? []),
  ];

  return (
    <Page title="Subscribers">
      <InlineStack align="start" gap="300" blockAlign="start" wrap={false}>
        <div style={{ width: 200, flexShrink: 0 }}>
          <Card padding="300">
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Filters
              </Text>
              <ChoiceList
                title="Status"
                allowMultiple
                choices={[
                  { label: 'Active', value: 'active' },
                  { label: 'Paused', value: 'paused' },
                  { label: 'Payment failed', value: 'payment_failed' },
                  { label: 'Cancelled', value: 'cancelled' },
                ]}
                selected={statuses}
                onChange={setStatuses}
              />
              <ChoiceList
                title="Risk level"
                allowMultiple
                choices={[
                  { label: 'Healthy', value: 'healthy' },
                  { label: 'At risk', value: 'at_risk' },
                  { label: 'Critical', value: 'critical' },
                ]}
                selected={riskLevels}
                onChange={setRiskLevels}
              />
              <Select
                label="Plan"
                options={planOptions}
                value={planId}
                onChange={setPlanId}
              />
              <Select
                label="Frequency"
                options={FREQUENCY_OPTIONS}
                value={frequency}
                onChange={setFrequency}
              />
              <TextField
                label="Next charge from"
                type="date"
                autoComplete="off"
                value={nextChargeFrom}
                onChange={setNextChargeFrom}
              />
              <TextField
                label="Next charge to"
                type="date"
                autoComplete="off"
                value={nextChargeTo}
                onChange={setNextChargeTo}
              />
            </BlockStack>
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="400">
            <TextField
              label="Search"
              labelHidden
              autoComplete="off"
              placeholder="Name, email, subscription ID, order ID"
              value={search}
              onChange={setSearch}
            />

            <InlineStack gap="200" wrap>
              <Button
                onClick={() => runBulk('pause')}
                disabled={!selected.length}
              >
                Pause selected
              </Button>
              <Button
                onClick={() => runBulk('resume')}
                disabled={!selected.length}
              >
                Resume selected
              </Button>
              <Button
                tone="critical"
                onClick={() => runBulk('cancel')}
                disabled={!selected.length}
              >
                Cancel selected
              </Button>
              <Button
                onClick={() =>
                  downloadCsv(
                    'subscribers.csv',
                    subscribers.map(subscriberToCsvRow),
                  )
                }
              >
                Export CSV
              </Button>
              <div style={{ width: 160 }}>
                <TextField
                  label="Tag"
                  labelHidden
                  autoComplete="off"
                  placeholder="Tag"
                  value={tag}
                  onChange={setTag}
                />
              </div>
              <Button
                onClick={() => runBulk('tag')}
                disabled={!selected.length || !tag}
              >
                Tag selected
              </Button>
            </InlineStack>

            {isLoading ? (
              <Spinner accessibilityLabel="Loading subscribers" />
            ) : null}
            {isError ? (
              <Banner
                tone="critical"
                title="Could not load subscribers"
                action={{ content: 'Retry', onAction: () => void refetch() }}
              >
                <p>
                  {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </Banner>
            ) : null}

            <Card padding="0">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: TABLE_GRID_COLUMNS,
                  gap: 6,
                  padding: '8px 10px',
                  borderBottom: '1px solid #e2e8f0',
                  fontWeight: 600,
                  fontSize: 11,
                }}
              >
                <Checkbox
                  label="Select all"
                  labelHidden
                  checked={allSelected}
                  onChange={toggleAll}
                />
                <span>Subscriber</span>
                <span>Plan</span>
                <span>Status</span>
                <span>Risk</span>
                <span>Next</span>
                <span>LTV</span>
                <span />
              </div>
              <div
                ref={parentRef}
                style={{
                  height: 520,
                  overflow: 'auto',
                  position: 'relative',
                }}
                onScroll={(event) => {
                  const target = event.currentTarget;
                  const nearBottom =
                    target.scrollTop + target.clientHeight >=
                    target.scrollHeight - 120;
                  if (nearBottom && hasNextPage && !isFetchingNextPage) {
                    void fetchNextPage();
                  }
                }}
              >
                <div
                  style={{
                    height: rowVirtualizer.getTotalSize(),
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = subscribers[virtualRow.index]!;
                    return (
                      <div
                        key={row.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: virtualRow.size,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'grid',
                          gridTemplateColumns: TABLE_GRID_COLUMNS,
                          gap: 6,
                          alignItems: 'center',
                          padding: '0 10px',
                          borderBottom: '1px solid #f1f5f9',
                          fontSize: 12,
                          background: selected.includes(row.id)
                            ? '#eef2ff'
                            : '#fff',
                        }}
                      >
                        <span onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            label={`Select ${row.id}`}
                            labelHidden
                            checked={selected.includes(row.id)}
                            onChange={() => toggleOne(row.id)}
                          />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ ...cellEllipsis, fontWeight: 500 }}>
                            {formatSubscriberName(row)}
                          </div>
                          <div
                            style={{
                              ...cellEllipsis,
                              fontSize: 11,
                              color: '#64748b',
                            }}
                          >
                            {row.customer.email}
                          </div>
                        </div>
                        <span style={cellEllipsis} title={row.plan.name}>
                          {row.plan.name}
                        </span>
                        <span>
                          <Badge size="small">
                            {formatStatusLabel(row.status)}
                          </Badge>
                        </span>
                        <span>
                          <RiskBadge score={row.riskScore} />
                        </span>
                        <span style={cellEllipsis}>
                          {formatShortDate(row.nextBillingDate)}
                        </span>
                        <span>${row.customer.lifetimeValue.toFixed(0)}</span>
                        <span>
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() => setActiveId(row.id)}
                          >
                            View
                          </Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
            <InlineStack align="space-between">
              <Text as="p" tone="subdued">
                Showing {subscribers.length} of {total} subscribers
              </Text>
              {isFetchingNextPage ? (
                <Spinner
                  accessibilityLabel="Loading more subscribers"
                  size="small"
                />
              ) : null}
            </InlineStack>
          </BlockStack>
        </div>
      </InlineStack>

      <SubscriberDrawer
        contractId={activeId}
        onClose={() => setActiveId(null)}
      />
    </Page>
  );
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'payment_failed':
      return 'Failed';
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    default:
      return status;
  }
}

function RiskBadge({ score }: { score: number }) {
  const tone =
    score >= 0.7 ? 'critical' : score >= 0.4 ? 'attention' : 'success';
  return (
    <Badge size="small" tone={tone}>{`${(score * 100).toFixed(0)}%`}</Badge>
  );
}

function subscriberToCsvRow(row: SubscriberRow): Record<string, unknown> {
  return {
    id: row.id,
    name: `${row.customer.firstName ?? ''} ${row.customer.lastName ?? ''}`.trim(),
    email: row.customer.email,
    plan: row.plan.name,
    status: row.status,
    riskScore: row.riskScore,
    healthStatus: row.healthStatus,
    frequency: row.frequency,
    nextBillingDate: row.nextBillingDate,
    ltv: row.customer.lifetimeValue,
  };
}
