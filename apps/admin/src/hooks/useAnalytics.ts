import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as api from '../lib/analytics-api';
import type { DateRangeKey } from '../types/analytics';

const STALE_MS = 15 * 60 * 1000;
const SUBSCRIBERS_STALE_MS = 30_000;

export function useDashboardOverview(
  range: DateRangeKey,
  start?: string,
  end?: string,
  growthDays?: 30 | 90 | 365,
) {
  return useQuery({
    queryKey: ['analytics-overview', range, start, end, growthDays],
    queryFn: () =>
      api.fetchDashboardOverview({ range, start, end, growthDays }),
    staleTime: STALE_MS,
    enabled: range !== 'custom' || Boolean(start && end),
  });
}

export function useCohorts(filters: {
  channel?: string;
  product?: string;
  geography?: string;
  discount?: string;
}) {
  return useQuery({
    queryKey: ['analytics-cohorts', filters],
    queryFn: () => api.fetchCohorts(filters),
    staleTime: STALE_MS,
  });
}

export function useSubscribers(filters: {
  search?: string;
  statuses?: string[];
  riskLevels?: string[];
  planId?: string;
  frequency?: string;
  nextChargeFrom?: string;
  nextChargeTo?: string;
  limit?: number;
}) {
  return useInfiniteQuery({
    queryKey: ['analytics-subscribers', filters],
    queryFn: ({ pageParam = 0 }) =>
      api.fetchSubscribers({
        ...filters,
        offset: pageParam,
        limit: filters.limit ?? 100,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
    staleTime: SUBSCRIBERS_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useSubscriberDetail(contractId: string | null) {
  return useQuery({
    queryKey: ['analytics-subscriber', contractId],
    queryFn: () => api.fetchSubscriberDetail(contractId!),
    enabled: Boolean(contractId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useBulkSubscriberAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.bulkSubscriberAction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['analytics-subscribers'],
      });
    },
  });
}

export function useAddNote(contractId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => api.addSubscriberNote(contractId, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['analytics-subscriber', contractId],
      });
    },
  });
}

export function useCreateIntervention(contractId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      interventionType: string;
      subject?: string;
      body?: string;
    }) => api.createManualIntervention(contractId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['analytics-subscriber', contractId],
      });
    },
  });
}

export function useAiPerformance() {
  return useQuery({
    queryKey: ['analytics-ai'],
    queryFn: api.fetchAiPerformance,
    staleTime: STALE_MS,
  });
}
