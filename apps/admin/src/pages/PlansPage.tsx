import { Banner, BlockStack, Page, Spinner, Text } from '@shopify/polaris';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DeletePlanModal } from '../components/plans/DeletePlanModal';
import { PlansTable } from '../components/plans/PlansTable';
import {
  StorefrontSetupModal,
  StorefrontWidgetBanner,
} from '../components/setup/StorefrontWidgetBanner';
import {
  useArchivePlan,
  useDeletePlan,
  usePlans,
  useResyncPlan,
  useUnarchivePlan,
} from '../hooks/usePlans';
import type { SubscriptionPlan } from '../types/plans';

export function PlansPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading, isError, error, refetch } = usePlans();
  const deletePlan = useDeletePlan();
  const archivePlan = useArchivePlan();
  const unarchivePlan = useUnarchivePlan();
  const resyncPlan = useResyncPlan();
  const [planToDelete, setPlanToDelete] = useState<SubscriptionPlan | null>(
    null,
  );
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(
    Boolean(
      (location.state as { showStorefrontSetup?: boolean } | null)
        ?.showStorefrontSetup,
    ),
  );

  const dismissSetup = () => {
    setSetupOpen(false);
    navigate('/plans', { replace: true, state: {} });
  };

  const pendingPlanId =
    archivePlan.isPending || unarchivePlan.isPending || resyncPlan.isPending
      ? (archivePlan.variables ??
        unarchivePlan.variables ??
        resyncPlan.variables ??
        null)
      : null;

  return (
    <Page
      title="Subscription plans"
      primaryAction={{
        content: 'Create plan',
        onAction: () => navigate('/plans/new'),
      }}
    >
      <BlockStack gap="400">
        <StorefrontWidgetBanner showWhenUnknown />

        {isLoading ? <Spinner accessibilityLabel="Loading plans" /> : null}

        {isError ? (
          <Banner
            tone="critical"
            title="Could not load plans"
            action={{ content: 'Retry', onAction: () => void refetch() }}
          >
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </Banner>
        ) : null}

        {deletePlan.isError ? (
          <Banner tone="critical" title="Delete failed">
            <p>
              {deletePlan.error instanceof Error
                ? deletePlan.error.message
                : 'Unknown error'}
            </p>
          </Banner>
        ) : null}

        {archivePlan.isError ? (
          <Banner tone="critical" title="Archive failed">
            <p>
              {archivePlan.error instanceof Error
                ? archivePlan.error.message
                : 'Unknown error'}
            </p>
          </Banner>
        ) : null}

        {unarchivePlan.isError ? (
          <Banner tone="critical" title="Unarchive failed">
            <p>
              {unarchivePlan.error instanceof Error
                ? unarchivePlan.error.message
                : 'Unknown error'}
            </p>
          </Banner>
        ) : null}

        {resyncPlan.isError ? (
          <Banner tone="critical" title="Storefront sync failed">
            <p>
              {resyncPlan.error instanceof Error
                ? resyncPlan.error.message
                : 'Unknown error'}
            </p>
          </Banner>
        ) : null}

        {syncMessage ? (
          <Banner
            tone="success"
            title="Storefront synced"
            onDismiss={() => setSyncMessage(null)}
          >
            <p>{syncMessage}</p>
          </Banner>
        ) : null}

        {data ? (
          <PlansTable
            plans={data}
            pendingPlanId={pendingPlanId}
            onArchive={(plan) => archivePlan.mutate(plan.id)}
            onUnarchive={(plan) => unarchivePlan.mutate(plan.id)}
            onDelete={setPlanToDelete}
            onResync={(plan) =>
              resyncPlan.mutate(plan.id, {
                onSuccess: () =>
                  setSyncMessage(
                    `"${plan.name}" now matches your storefront options.`,
                  ),
              })
            }
          />
        ) : null}

        {!isLoading && !isError && !data ? (
          <Text as="p" tone="subdued">
            No data
          </Text>
        ) : null}
      </BlockStack>

      <DeletePlanModal
        plan={planToDelete}
        open={Boolean(planToDelete)}
        loading={deletePlan.isPending}
        archiveLoading={archivePlan.isPending}
        onClose={() => setPlanToDelete(null)}
        onConfirm={() => {
          if (!planToDelete) return;
          deletePlan.mutate(planToDelete.id, {
            onSuccess: () => setPlanToDelete(null),
          });
        }}
        onArchive={() => {
          if (!planToDelete) return;
          archivePlan.mutate(planToDelete.id, {
            onSuccess: () => setPlanToDelete(null),
          });
        }}
      />
      <StorefrontSetupModal open={setupOpen} onClose={dismissSetup} />
    </Page>
  );
}
