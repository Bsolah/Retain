import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createManualSubscription,
  lookupManualSubscriptionCustomer,
  type ManualSubscriptionPayload,
} from '../lib/manual-subscription-api';

export function useManualSubscriptionCustomerLookup(email: string) {
  return useQuery({
    queryKey: ['manual-subscription-customer', email],
    queryFn: () => lookupManualSubscriptionCustomer(email),
    enabled: email.includes('@') && email.length > 5,
    staleTime: 30_000,
  });
}

export function useCreateManualSubscription() {
  return useMutation({
    mutationFn: (payload: ManualSubscriptionPayload) =>
      createManualSubscription(payload),
  });
}
