import { Banner, Modal, Text } from '@shopify/polaris';
import type { SubscriptionPlan } from '../../types/plans';

type DeletePlanModalProps = {
  plan: SubscriptionPlan | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onArchive?: () => void;
  archiveLoading?: boolean;
};

export function DeletePlanModal({
  plan,
  open,
  loading,
  onClose,
  onConfirm,
  onArchive,
  archiveLoading,
}: DeletePlanModalProps) {
  if (!plan) {
    return null;
  }

  const hasSubscribers = plan.subscriberCount > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delete “${plan.name}”?`}
      primaryAction={
        hasSubscribers
          ? undefined
          : {
              content: 'Delete plan',
              destructive: true,
              loading,
              onAction: onConfirm,
            }
      }
      secondaryActions={[
        { content: 'Cancel', onAction: onClose },
        ...(hasSubscribers && onArchive
          ? [
              {
                content: 'Archive instead',
                loading: archiveLoading,
                onAction: onArchive,
              },
            ]
          : []),
      ]}
    >
      <Modal.Section>
        {hasSubscribers ? (
          <Banner tone="warning" title="Plan has active subscribers">
            <p>
              This plan has{' '}
              <Text as="span" fontWeight="semibold">
                {plan.subscriberCount}
              </Text>{' '}
              active subscriber{plan.subscriberCount === 1 ? '' : 's'}. You
              cannot permanently delete it. Archive the plan to stop new signups
              while keeping existing subscriptions.
            </p>
          </Banner>
        ) : (
          <>
            <Text as="p">
              This permanently removes the plan from Retain and deletes its
              selling plan group in Shopify. This cannot be undone.
            </Text>
            <Text as="p" tone="subdued">
              Plans with subscribers must be archived instead of deleted.
            </Text>
          </>
        )}
      </Modal.Section>
    </Modal>
  );
}
