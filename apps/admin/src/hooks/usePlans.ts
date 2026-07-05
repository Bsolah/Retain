import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { graphqlRequest } from '../lib/api';
import { getShopId } from '../lib/session';
import type {
  PlanInput,
  PlanStatus,
  ShopifyCollection,
  ShopifyProduct,
  SubscriptionPlan,
} from '../types/plans';

const PLAN_FIELDS = `
  id
  shopId
  name
  description
  status
  planType
  frequencies {
    interval
    unit
    discountPercent
    prepaidBillingInterval
  }
  minimumCommitment
  trialPeriodDays
  pricingStrategy
  discountValue
  boxConfig {
    minItems
    maxItems
    allowSwaps
    slots { id label required }
    eligibleProductIds
  }
  productIds
  collectionIds
  subscriberCount
  revenue
  createdAt
  updatedAt
`;

const PLANS_QUERY = `
  query Plans($shopId: ID!, $status: PlanStatus) {
    plans(shopId: $shopId, status: $status) {
      ${PLAN_FIELDS}
    }
  }
`;

const CREATE_PLAN = `
  mutation CreatePlan($input: PlanInput!) {
    createPlan(input: $input) {
      ${PLAN_FIELDS}
    }
  }
`;

const ARCHIVE_PLAN = `
  mutation ArchivePlan($id: ID!) {
    archivePlan(id: $id) {
      id
      status
      subscriberCount
      revenue
    }
  }
`;

const UNARCHIVE_PLAN = `
  mutation UnarchivePlan($id: ID!) {
    unarchivePlan(id: $id) {
      id
      status
      subscriberCount
      revenue
    }
  }
`;

const DELETE_PLAN = `
  mutation DeletePlan($id: ID!) {
    deletePlan(id: $id) {
      id
      name
      status
    }
  }
`;

const UPDATE_PLAN = `
  mutation UpdatePlan($id: ID!, $input: PlanInput!) {
    updatePlan(id: $id, input: $input) {
      ${PLAN_FIELDS}
    }
  }
`;

const RESYNC_PLAN = `
  mutation ResyncPlan($id: ID!) {
    resyncPlan(id: $id) {
      ${PLAN_FIELDS}
    }
  }
`;

const PLAN_QUERY = `
  query Plan($id: ID!) {
    plan(id: $id) {
      ${PLAN_FIELDS}
    }
  }
`;

const SEARCH_PRODUCTS = `
  query SearchProducts($query: String!, $first: Int) {
    searchProducts(query: $query, first: $first) {
      id
      title
      handle
      status
      featuredImageUrl
      variants { id title price }
    }
  }
`;

const COLLECTIONS = `
  query Collections($first: Int) {
    collections(first: $first) {
      id
      title
      handle
    }
  }
`;

export function usePlans(status?: PlanStatus) {
  const shopId = getShopId();

  return useQuery({
    queryKey: ['plans', shopId, status ?? 'all'],
    enabled: Boolean(shopId),
    queryFn: async () => {
      const data = await graphqlRequest<{ plans: SubscriptionPlan[] }>(
        PLANS_QUERY,
        { shopId, status },
      );
      return data.plans;
    },
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  const shopId = getShopId();

  return useMutation({
    mutationFn: async (input: PlanInput) => {
      const data = await graphqlRequest<{ createPlan: SubscriptionPlan }>(
        CREATE_PLAN,
        { input },
      );
      return data.createPlan;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['plans', shopId] });
      const previous = queryClient.getQueryData<SubscriptionPlan[]>([
        'plans',
        shopId,
        'all',
      ]);

      const optimistic: SubscriptionPlan = {
        id: `optimistic-${Date.now()}`,
        shopId: shopId ?? '',
        name: input.name,
        description: input.description,
        status: 'active',
        planType: input.planType,
        frequencies: input.frequencies,
        minimumCommitment: input.minimumCommitment,
        trialPeriodDays: input.trialPeriodDays ?? 0,
        pricingStrategy: input.pricingStrategy,
        discountValue: input.discountValue,
        productIds: input.productIds ?? [],
        collectionIds: input.collectionIds ?? [],
        subscriberCount: 0,
        revenue: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<SubscriptionPlan[]>(
        ['plans', shopId, 'all'],
        (current) => [optimistic, ...(current ?? [])],
      );

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['plans', shopId, 'all'], context.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans', shopId] });
    },
  });
}

export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: ['plan', planId],
    enabled: Boolean(planId),
    queryFn: async () => {
      const data = await graphqlRequest<{ plan: SubscriptionPlan | null }>(
        PLAN_QUERY,
        { id: planId },
      );
      if (!data.plan) {
        throw new Error('Plan not found');
      }
      return data.plan;
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  const shopId = getShopId();

  return useMutation({
    mutationFn: async (payload: { id: string; input: PlanInput }) => {
      const data = await graphqlRequest<{ updatePlan: SubscriptionPlan }>(
        UPDATE_PLAN,
        payload,
      );
      return data.updatePlan;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans', shopId] });
      await queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  const shopId = getShopId();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await graphqlRequest<{ deletePlan: SubscriptionPlan }>(
        DELETE_PLAN,
        { id },
      );
      return data.deletePlan;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans', shopId] });
    },
  });
}

export function useArchivePlan() {
  const queryClient = useQueryClient();
  const shopId = getShopId();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await graphqlRequest<{ archivePlan: SubscriptionPlan }>(
        ARCHIVE_PLAN,
        { id },
      );
      return data.archivePlan;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans', shopId] });
    },
  });
}

export function useUnarchivePlan() {
  const queryClient = useQueryClient();
  const shopId = getShopId();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await graphqlRequest<{ unarchivePlan: SubscriptionPlan }>(
        UNARCHIVE_PLAN,
        { id },
      );
      return data.unarchivePlan;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans', shopId] });
    },
  });
}

export function useResyncPlan() {
  const queryClient = useQueryClient();
  const shopId = getShopId();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await graphqlRequest<{ resyncPlan: SubscriptionPlan }>(
        RESYNC_PLAN,
        { id },
      );
      return data.resyncPlan;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans', shopId] });
    },
  });
}

export function useSearchProducts(query: string, first = 50) {
  // Empty query lists products; non-empty searches by title.
  const shopifyQuery = query.trim().length > 0 ? query.trim() : 'status:active';

  return useQuery({
    queryKey: ['products', shopifyQuery, first],
    queryFn: async () => {
      const data = await graphqlRequest<{ searchProducts: ShopifyProduct[] }>(
        SEARCH_PRODUCTS,
        { query: shopifyQuery, first },
      );
      return data.searchProducts;
    },
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const data = await graphqlRequest<{ collections: ShopifyCollection[] }>(
        COLLECTIONS,
        { first: 50 },
      );
      return data.collections;
    },
  });
}
