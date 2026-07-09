import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  InlineStack,
  Tooltip,
} from '@shopify/polaris';
import {
  ArchiveIcon,
  DeleteIcon,
  EditIcon,
  UndoIcon,
} from '@shopify/polaris-icons';
import type { FunctionComponent, SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlanFrequency, SubscriptionPlan } from '../../types/plans';

type PlansTableProps = {
  plans: SubscriptionPlan[];
  onArchive: (plan: SubscriptionPlan) => void;
  onUnarchive: (plan: SubscriptionPlan) => void;
  onDelete: (plan: SubscriptionPlan) => void;
  pendingPlanId?: string | null;
};

type IconActionButtonProps = {
  icon: FunctionComponent<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
  loading?: boolean;
  tone?: 'critical';
};

function IconActionButton({
  icon,
  label,
  onClick,
  loading,
  tone,
}: IconActionButtonProps) {
  return (
    <Tooltip content={label}>
      <Button
        icon={icon}
        variant="plain"
        accessibilityLabel={label}
        loading={loading}
        tone={tone}
        onClick={onClick}
      />
    </Tooltip>
  );
}

function statusTone(
  status: SubscriptionPlan['status'],
): 'success' | 'attention' | 'info' {
  if (status === 'active') return 'success';
  if (status === 'paused') return 'attention';
  return 'info';
}

function formatFrequency(frequency: PlanFrequency): string {
  const unit = frequency.unit.charAt(0).toUpperCase() + frequency.unit.slice(1);
  const plural = frequency.interval === 1 ? unit : `${unit}s`;
  return `${frequency.interval} ${plural}`;
}

function formatFrequencies(frequencies: PlanFrequency[]): string {
  if (frequencies.length === 0) return '—';
  return frequencies.map(formatFrequency).join(', ');
}

export function PlansTable({
  plans,
  onArchive,
  onUnarchive,
  onDelete,
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
        <InlineStack key={`${plan.id}-actions`} gap="100">
          <IconActionButton
            icon={UndoIcon}
            label="Unarchive"
            loading={isPending}
            onClick={() => onUnarchive(plan)}
          />
          <IconActionButton
            icon={DeleteIcon}
            label="Delete"
            tone="critical"
            loading={isPending}
            onClick={() => onDelete(plan)}
          />
        </InlineStack>
      ) : (
        <InlineStack key={`${plan.id}-actions`} gap="100">
          <IconActionButton
            icon={EditIcon}
            label="Edit"
            onClick={() => navigate(`/plans/${plan.id}/edit`)}
          />
          <IconActionButton
            icon={ArchiveIcon}
            label="Archive"
            loading={isPending}
            onClick={() => onArchive(plan)}
          />
          <IconActionButton
            icon={DeleteIcon}
            label="Delete"
            tone="critical"
            onClick={() => onDelete(plan)}
          />
        </InlineStack>
      );

    return [
      plan.name,
      plan.planType,
      formatFrequencies(plan.frequencies),
      String(plan.productIds.length),
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
          'text',
          'numeric',
          'numeric',
          'text',
        ]}
        headings={[
          'Name',
          'Type',
          'Frequency',
          'Products',
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
