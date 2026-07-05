import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useSubscriptions() {
  return useQuery({
    queryKey: ['portal-subscriptions'],
    queryFn: api.getSubscriptions,
  });
}

export function useSubscription(contractId: string) {
  return useQuery({
    queryKey: ['portal-subscription', contractId],
    queryFn: () => api.getSubscription(contractId),
    enabled: Boolean(contractId),
  });
}

export function useSubscriptionActions(contractId: string) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['portal-subscriptions'] });
    await queryClient.invalidateQueries({
      queryKey: ['portal-subscription', contractId],
    });
  };

  const pause = useMutation({
    mutationFn: (duration: number) =>
      api.pauseSubscription(contractId, duration),
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: () => api.resumeSubscription(contractId),
    onSuccess: invalidate,
  });

  const skip = useMutation({
    mutationFn: () => api.skipSubscription(contractId),
    onSuccess: invalidate,
  });

  const swap = useMutation({
    mutationFn: (input: { newProductId: string; newVariantId: string }) =>
      api.swapSubscription(contractId, input.newProductId, input.newVariantId),
    onSuccess: invalidate,
  });

  const updateBox = useMutation({
    mutationFn: (
      items: Array<{
        productId: string;
        variantId: string;
        quantity: number;
        slot?: string;
      }>,
    ) => api.updateBoxItems(contractId, items),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: (input: { reason: string; feedback?: string }) =>
      api.cancelSubscription(contractId, input.reason, input.feedback),
    onSuccess: invalidate,
  });

  return { pause, resume, skip, swap, updateBox, cancel };
}
