import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  InlineStack,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import type { SubscriptionPlan } from '../../types/plans';

type PlansTableProps = {
  plans: SubscriptionPlan[];
  onArchive: (plan: SubscriptionPlan) => void;
  onUnarchive: (plan: SubscriptionPlan) => void;
  onDelete: (plan: SubscriptionPlan) => void;
  onResync: (plan: SubscriptionPlan) => void;
  pendingPlanId?: string | null;
};

function statusTone(
  status: SubscriptionPlan['status'],
): 'success' | 'attention' | 'info' {
  if (status === 'active') return 'success';
  if (status === 'paused') return 'attention';
  return 'info';
}

export function PlansTable({
  plans,
  onArchive,
  onUnarchive,
  onDelete,
  onResync,
  pendingPlanId,
}: PlansTableProps) {
  const navigate = useNavigate();

  if (plans.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No subscription plans yet"
          action={{ content: 'Create plan', url: '/plans/new' }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>Create your first plan to start selling subscriptions.</p>
        </EmptyState>
      </Card>
    );
  }

  const rows = plans.map((plan) => {
    const isPending = pendingPlanId === plan.id;

    const actions =
      plan.status === 'archived' ? (
        <InlineStack key={`${plan.id}-actions`} gap="200">
          <Button loading={isPending} onClick={() => onUnarchive(plan)}>
            Unarchive
          </Button>
          <Button
            tone="critical"
            loading={isPending}
            onClick={() => onDelete(plan)}
          >
            Delete
          </Button>
        </InlineStack>
      ) : (
        <InlineStack key={`${plan.id}-actions`} gap="200">
          <Button onClick={() => navigate(`/plans/${plan.id}/edit`)}>
            Edit
          </Button>
          <Button loading={isPending} onClick={() => onResync(plan)}>
            Sync storefront
          </Button>
          <Button loading={isPending} onClick={() => onArchive(plan)}>
            Archive
          </Button>
          <Button tone="critical" onClick={() => onDelete(plan)}>
            Delete
          </Button>
        </InlineStack>
      );

    return [
      plan.name,
      plan.planType,
      <Badge key={`${plan.id}-status`} tone={statusTone(plan.status)}>
        {plan.status}
      </Badge>,
      String(plan.subscriberCount),
      `$${plan.revenue.toFixed(2)}`,
      actions,
    ];
  });

  return (
    <Card padding="0">
      <DataTable
        columnContentTypes={[
          'text',
          'text',
          'text',
          'numeric',
          'numeric',
          'text',
        ]}
        headings={[
          'Name',
          'Type',
          'Status',
          'Subscribers',
          'Revenue',
          'Actions',
        ]}
        rows={rows}
      />
    </Card>
  );
}
