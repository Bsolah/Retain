import type {
  Shop,
  SubscriptionPlan as DbSubscriptionPlan,
} from '@retain/database';
import { PlanStatus, prisma } from '@retain/database';
import { RETAIN_SELLING_PLAN_APP_ID } from '@retain/shopify-admin';
import { ShopifyClientError, shopifyAdminGraphql } from './shopify-client.js';
import type { ValidatedFrequency } from './plan-validation.js';

const INTERVAL_MAP = {
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
} as const;

const UNIT_LABEL = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
} as const;

export type SellingPlanCreateInput = {
  name: string;
  description?: string | null;
  planType: 'standard' | 'prepaid' | 'box';
  frequencies: ValidatedFrequency[];
  productIds: string[];
  collectionIds: string[];
};

/** Build Shopify sync input from a Retain subscription plan row. */
export function sellingPlanInputFromRecord(
  plan: Pick<
    DbSubscriptionPlan,
    | 'name'
    | 'description'
    | 'planType'
    | 'frequencies'
    | 'productIds'
    | 'collectionIds'
  >,
  frequencies: ValidatedFrequency[],
): SellingPlanCreateInput {
  return {
    name: plan.name,
    description: plan.description,
    planType: plan.planType,
    frequencies,
    productIds: plan.productIds,
    collectionIds: plan.collectionIds,
  };
}

/**
 * Remove a selling plan group from Shopify — hides subscribe option on all
 * linked products. Existing subscription contracts are unaffected.
 */
export async function hideSellingPlanGroupFromProducts(
  shop: Shop,
  groupId: string,
): Promise<void> {
  await deleteSellingPlanGroup(shop, groupId);
}

function optionValue(frequency: ValidatedFrequency): string {
  const label = UNIT_LABEL[frequency.unit];
  const plural = frequency.interval === 1 ? label : `${label}s`;
  return `${frequency.interval} ${plural}`;
}

function buildSellingPlans(
  input: SellingPlanCreateInput,
): Array<Record<string, unknown>> {
  const isPrepaid = input.planType === 'prepaid';
  const seenOptions = new Set<string>();

  return input.frequencies.map((frequency, index) => {
    const interval = INTERVAL_MAP[frequency.unit];
    const discountPercent = frequency.discountPercent ?? 0;

    const pricingPolicies = [
      {
        fixed: {
          adjustmentType: 'PERCENTAGE',
          adjustmentValue: {
            percentage: discountPercent,
          },
        },
      },
    ];

    let deliveryLabel = optionValue(frequency);
    if (seenOptions.has(deliveryLabel)) {
      deliveryLabel = `${deliveryLabel} (${index + 1})`;
    }
    seenOptions.add(deliveryLabel);
    const billingCount = isPrepaid
      ? (frequency.prepaidBillingInterval ?? frequency.interval)
      : frequency.interval;

    const displayName =
      input.frequencies.length > 1
        ? `${input.name} — ${deliveryLabel}`
        : input.name;

    return {
      name: displayName,
      // Must align with sellingPlanGroup.options[0] ("Delivery every")
      options: [deliveryLabel],
      category: 'SUBSCRIPTION',
      billingPolicy: {
        recurring: {
          interval,
          intervalCount: billingCount,
        },
      },
      deliveryPolicy: {
        recurring: {
          interval,
          intervalCount: frequency.interval,
          intent: 'FULFILLMENT_BEGIN',
        },
      },
      pricingPolicies,
    };
  });
}

function isBenignResourceTakenError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already been taken') ||
    normalized.includes('already taken') ||
    normalized.includes('resource has already been taken')
  );
}

function formatShopifyError(error: unknown): string {
  if (error instanceof ShopifyClientError) {
    if (typeof error.details === 'string' && error.details.length > 0) {
      return `${error.message}: ${error.details}`;
    }
    if (Array.isArray(error.details)) {
      return error.details
        .map((item) =>
          typeof item === 'object' && item && 'message' in item
            ? String((item as { message: string }).message)
            : String(item),
        )
        .join('; ');
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown Shopify error';
}

/**
 * Shopify selling plan groups only accept products/variants — not collections.
 * Expand each collection to its product GIDs so plans apply to collection contents.
 */
async function expandCollectionProductIds(
  shop: Shop,
  collectionIds: string[],
): Promise<string[]> {
  const productIds: string[] = [];

  for (const collectionId of collectionIds) {
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const data: {
        collection: {
          products: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            edges: Array<{ node: { id: string } }>;
          };
        } | null;
      } = await shopifyAdminGraphql(
        shop,
        `#graphql
          query CollectionProducts($id: ID!, $cursor: String) {
            collection(id: $id) {
              products(first: 100, after: $cursor) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        `,
        { id: collectionId, cursor },
      );

      for (const edge of data.collection?.products.edges ?? []) {
        productIds.push(edge.node.id);
      }

      hasNextPage = data.collection?.products.pageInfo.hasNextPage ?? false;
      cursor = data.collection?.products.pageInfo.endCursor ?? null;
    }
  }

  return productIds;
}

async function resolveResourceProductIds(
  shop: Shop,
  input: SellingPlanCreateInput,
): Promise<string[]> {
  const fromCollections =
    input.collectionIds.length > 0
      ? await expandCollectionProductIds(shop, input.collectionIds)
      : [];

  return [...new Set([...input.productIds, ...fromCollections])];
}

const CREATE_MUTATION = `#graphql
  mutation SellingPlanGroupCreate(
    $input: SellingPlanGroupInput!
    $resources: SellingPlanGroupResourceInput
  ) {
    sellingPlanGroupCreate(input: $input, resources: $resources) {
      sellingPlanGroup {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_MUTATION = `#graphql
  mutation SellingPlanGroupUpdate($id: ID!, $input: SellingPlanGroupInput!) {
    sellingPlanGroupUpdate(id: $id, input: $input) {
      sellingPlanGroup {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_MUTATION = `#graphql
  mutation SellingPlanGroupDelete($id: ID!) {
    sellingPlanGroupDelete(id: $id) {
      deletedSellingPlanGroupId
      userErrors {
        field
        message
      }
    }
  }
`;

const ADD_PRODUCTS_MUTATION = `#graphql
  mutation SellingPlanGroupAddProducts($id: ID!, $productIds: [ID!]!) {
    sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
      userErrors {
        field
        message
      }
    }
  }
`;

const REMOVE_PRODUCTS_MUTATION = `#graphql
  mutation SellingPlanGroupRemoveProducts($id: ID!, $productIds: [ID!]!) {
    sellingPlanGroupRemoveProducts(id: $id, productIds: $productIds) {
      userErrors {
        field
        message
      }
    }
  }
`;

const GROUP_PLANS_QUERY = `#graphql
  query SellingPlanGroupPlans($id: ID!) {
    sellingPlanGroup(id: $id) {
      name
      sellingPlans(first: 50) {
        nodes {
          id
          name
          options
        }
      }
      products(first: 250) {
        nodes {
          id
        }
      }
    }
  }
`;

type ShopifySellingPlanSnapshot = {
  name: string;
  options: string[];
};

type SellingPlanGroupState = {
  name: string;
  sellingPlans: ShopifySellingPlanSnapshot[];
  productIds: string[];
};

function sellingPlanSignature(
  plans: Array<{ name: string; options: string[] }>,
): string {
  return plans
    .map((plan) => `${plan.name}::${[...plan.options].sort().join(',')}`)
    .sort()
    .join('|');
}

/** True when Shopify selling plans do not match what Retain would create. */
export function shopifySellingPlansDrift(
  shopifyPlans: ShopifySellingPlanSnapshot[],
  input: SellingPlanCreateInput,
): boolean {
  const expected = buildSellingPlans(input).map((plan) => ({
    name: String(plan.name),
    options: (plan.options as string[]) ?? [],
  }));

  if (shopifyPlans.length !== expected.length) return true;
  return sellingPlanSignature(shopifyPlans) !== sellingPlanSignature(expected);
}

async function fetchSellingPlanGroupState(
  shop: Shop,
  groupId: string,
): Promise<SellingPlanGroupState | null> {
  const data = await shopifyAdminGraphql<{
    sellingPlanGroup: {
      name: string;
      sellingPlans: {
        nodes: Array<{ id: string; name: string; options: string[] }>;
      };
      products: { nodes: Array<{ id: string }> };
    } | null;
  }>(shop, GROUP_PLANS_QUERY, { id: groupId });

  const group = data.sellingPlanGroup;
  if (!group) return null;

  return {
    name: group.name,
    sellingPlans: group.sellingPlans.nodes.map((plan) => ({
      name: plan.name,
      options: plan.options,
    })),
    productIds: group.products.nodes.map((product) => product.id),
  };
}

export async function fetchSellingPlanIdsForGroup(
  shop: Shop,
  groupId: string,
): Promise<string[]> {
  const data = await shopifyAdminGraphql<{
    sellingPlanGroup: {
      sellingPlans: { nodes: Array<{ id: string }> };
    } | null;
  }>(
    shop,
    `#graphql
      query SellingPlanGroupPlanIds($id: ID!) {
        sellingPlanGroup(id: $id) {
          sellingPlans(first: 50) {
            nodes { id }
          }
        }
      }
    `,
    { id: groupId },
  );

  return data.sellingPlanGroup?.sellingPlans.nodes.map((plan) => plan.id) ?? [];
}

/** Replace all selling plans in a group so storefront options match Retain exactly. */
export function buildSellingPlanReplaceInput(
  input: SellingPlanCreateInput,
  existingPlanIds: string[],
): Record<string, unknown> {
  return {
    name: input.name,
    appId: RETAIN_SELLING_PLAN_APP_ID,
    options: ['Delivery every'],
    sellingPlansToDelete: existingPlanIds,
    sellingPlansToCreate: buildSellingPlans(input),
  };
}

export async function createSellingPlanGroup(
  shop: Shop,
  input: SellingPlanCreateInput,
): Promise<string> {
  const merchantCode = `${input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)}-${Date.now().toString(36)}`;

  const productIds = await resolveResourceProductIds(shop, input);
  if (productIds.length === 0) {
    throw new Error(
      'No products to attach. Select products or collections that contain products.',
    );
  }

  try {
    const data = await shopifyAdminGraphql<{
      sellingPlanGroupCreate: {
        sellingPlanGroup: { id: string } | null;
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(shop, CREATE_MUTATION, {
      input: {
        name: input.name,
        merchantCode,
        appId: RETAIN_SELLING_PLAN_APP_ID,
        options: ['Delivery every'],
        sellingPlansToCreate: buildSellingPlans(input),
      },
      resources: {
        productIds,
      },
    });

    const payload = data.sellingPlanGroupCreate;
    if (payload.userErrors.length > 0) {
      throw new Error(
        payload.userErrors
          .map((error) =>
            error.field?.length
              ? `${error.field.join('.')}: ${error.message}`
              : error.message,
          )
          .join('; '),
      );
    }

    if (!payload.sellingPlanGroup?.id) {
      throw new Error('Shopify did not return a selling plan group id');
    }

    return payload.sellingPlanGroup.id;
  } catch (error) {
    throw new Error(formatShopifyError(error));
  }
}

export type SellingPlanUpdateOptions = {
  /** Previous Retain state — used to diff products and skip selling-plan replace. */
  previous?: SellingPlanCreateInput;
};

function frequencySignature(frequency: ValidatedFrequency): string {
  return JSON.stringify({
    interval: frequency.interval,
    unit: frequency.unit,
    discountPercent: frequency.discountPercent ?? null,
    prepaidBillingInterval: frequency.prepaidBillingInterval ?? null,
  });
}

/** True when Shopify selling plans must be deleted and recreated. */
export function sellingPlansNeedReplace(
  previous: SellingPlanCreateInput,
  next: SellingPlanCreateInput,
): boolean {
  if (previous.name !== next.name) return true;
  if (previous.planType !== next.planType) return true;

  const prev = previous.frequencies.map(frequencySignature).sort();
  const updated = next.frequencies.map(frequencySignature).sort();
  return prev.join('|') !== updated.join('|');
}

function filterBlockingUserErrors(
  errors: Array<{ message: string }>,
): Array<{ message: string }> {
  return errors.filter((error) => !isBenignResourceTakenError(error.message));
}

async function syncSellingPlanGroupProducts(
  shop: Shop,
  groupId: string,
  input: SellingPlanCreateInput,
  previous?: SellingPlanCreateInput,
): Promise<void> {
  const nextProductIds = await resolveResourceProductIds(shop, input);
  if (nextProductIds.length === 0) {
    throw new Error(
      'No products to attach. Select products or collections that contain products.',
    );
  }

  const previousProductIds = previous
    ? await resolveResourceProductIds(shop, previous)
    : [];

  const toAdd = previous
    ? nextProductIds.filter((id) => !previousProductIds.includes(id))
    : nextProductIds;
  const toRemove = previous
    ? previousProductIds.filter((id) => !nextProductIds.includes(id))
    : [];

  if (toRemove.length > 0) {
    const removeResult = await shopifyAdminGraphql<{
      sellingPlanGroupRemoveProducts: {
        userErrors: Array<{ message: string }>;
      };
    }>(shop, REMOVE_PRODUCTS_MUTATION, { id: groupId, productIds: toRemove });

    const blockingErrors = filterBlockingUserErrors(
      removeResult.sellingPlanGroupRemoveProducts.userErrors,
    );
    if (blockingErrors.length > 0) {
      throw new Error(blockingErrors.map((error) => error.message).join('; '));
    }
  }

  if (toAdd.length > 0) {
    const addResult = await shopifyAdminGraphql<{
      sellingPlanGroupAddProducts: {
        userErrors: Array<{ message: string }>;
      };
    }>(shop, ADD_PRODUCTS_MUTATION, { id: groupId, productIds: toAdd });

    const blockingErrors = filterBlockingUserErrors(
      addResult.sellingPlanGroupAddProducts.userErrors,
    );
    if (blockingErrors.length > 0) {
      throw new Error(blockingErrors.map((error) => error.message).join('; '));
    }
  }
}

async function replaceSellingPlansInGroup(
  shop: Shop,
  groupId: string,
  input: SellingPlanCreateInput,
): Promise<void> {
  const existingPlanIds = await fetchSellingPlanIdsForGroup(shop, groupId);
  const updateInput = buildSellingPlanReplaceInput(input, existingPlanIds);

  const result = await shopifyAdminGraphql<{
    sellingPlanGroupUpdate: {
      sellingPlanGroup: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(shop, UPDATE_MUTATION, {
    id: groupId,
    input: updateInput,
  });

  if (result.sellingPlanGroupUpdate.userErrors.length > 0) {
    throw new Error(
      result.sellingPlanGroupUpdate.userErrors
        .map((error) => error.message)
        .join('; '),
    );
  }
}

export async function updateSellingPlanGroup(
  shop: Shop,
  groupId: string,
  input: SellingPlanCreateInput,
  options?: SellingPlanUpdateOptions,
): Promise<void> {
  try {
    const previous = options?.previous;
    const shouldReplacePlans =
      !previous || sellingPlansNeedReplace(previous, input);

    if (shouldReplacePlans) {
      await replaceSellingPlansInGroup(shop, groupId, input);
      await syncSellingPlanGroupProducts(shop, groupId, input, previous);
      await stampRetainAppId(shop, groupId);
      return;
    }

    const nameResult = await shopifyAdminGraphql<{
      sellingPlanGroupUpdate: {
        userErrors: Array<{ message: string }>;
      };
    }>(shop, UPDATE_MUTATION, {
      id: groupId,
      input: {
        name: input.name,
        options: ['Delivery every'],
        appId: RETAIN_SELLING_PLAN_APP_ID,
      },
    });

    if (nameResult.sellingPlanGroupUpdate.userErrors.length > 0) {
      throw new Error(
        nameResult.sellingPlanGroupUpdate.userErrors
          .map((error) => error.message)
          .join('; '),
      );
    }

    await syncSellingPlanGroupProducts(shop, groupId, input, previous);
    await stampRetainAppId(shop, groupId);
  } catch (error) {
    throw new Error(formatShopifyError(error));
  }
}

async function stampRetainAppId(shop: Shop, groupId: string): Promise<void> {
  const result = await shopifyAdminGraphql<{
    sellingPlanGroupUpdate: {
      userErrors: Array<{ message: string }>;
    };
  }>(shop, UPDATE_MUTATION, {
    id: groupId,
    input: {
      appId: RETAIN_SELLING_PLAN_APP_ID,
    },
  });

  const blockingErrors = filterBlockingUserErrors(
    result.sellingPlanGroupUpdate.userErrors,
  );
  if (blockingErrors.length > 0) {
    throw new Error(blockingErrors.map((error) => error.message).join('; '));
  }
}

async function syncProductsToMatchShopifyState(
  shop: Shop,
  groupId: string,
  input: SellingPlanCreateInput,
  currentShopifyProductIds: string[],
): Promise<void> {
  const targetProductIds = await resolveResourceProductIds(shop, input);
  if (targetProductIds.length === 0) {
    throw new Error(
      'No products to attach. Select products or collections that contain products.',
    );
  }

  const toAdd = targetProductIds.filter(
    (id) => !currentShopifyProductIds.includes(id),
  );
  const toRemove = currentShopifyProductIds.filter(
    (id) => !targetProductIds.includes(id),
  );

  if (toRemove.length > 0) {
    const removeResult = await shopifyAdminGraphql<{
      sellingPlanGroupRemoveProducts: {
        userErrors: Array<{ message: string }>;
      };
    }>(shop, REMOVE_PRODUCTS_MUTATION, { id: groupId, productIds: toRemove });

    const blockingErrors = filterBlockingUserErrors(
      removeResult.sellingPlanGroupRemoveProducts.userErrors,
    );
    if (blockingErrors.length > 0) {
      throw new Error(blockingErrors.map((error) => error.message).join('; '));
    }
  }

  if (toAdd.length > 0) {
    const addResult = await shopifyAdminGraphql<{
      sellingPlanGroupAddProducts: {
        userErrors: Array<{ message: string }>;
      };
    }>(shop, ADD_PRODUCTS_MUTATION, { id: groupId, productIds: toAdd });

    const blockingErrors = filterBlockingUserErrors(
      addResult.sellingPlanGroupAddProducts.userErrors,
    );
    if (blockingErrors.length > 0) {
      throw new Error(blockingErrors.map((error) => error.message).join('; '));
    }
  }
}

/**
 * Repair sync: compare live Shopify state to Retain and only replace selling
 * plans when the storefront has drifted.
 */
export async function resyncSellingPlanGroup(
  shop: Shop,
  groupId: string,
  input: SellingPlanCreateInput,
): Promise<void> {
  try {
    const state = await fetchSellingPlanGroupState(shop, groupId);
    if (!state) {
      throw new Error('Selling plan group not found in Shopify');
    }

    const plansDrifted = shopifySellingPlansDrift(state.sellingPlans, input);
    const groupNameChanged = state.name !== input.name;

    if (plansDrifted || groupNameChanged) {
      await replaceSellingPlansInGroup(shop, groupId, input);
    }

    await syncProductsToMatchShopifyState(
      shop,
      groupId,
      input,
      state.productIds,
    );
    await stampRetainAppId(shop, groupId);
  } catch (error) {
    throw new Error(formatShopifyError(error));
  }
}

export async function deleteSellingPlanGroup(
  shop: Shop,
  groupId: string,
): Promise<void> {
  try {
    const data = await shopifyAdminGraphql<{
      sellingPlanGroupDelete: {
        deletedSellingPlanGroupId: string | null;
        userErrors: Array<{ message: string }>;
      };
    }>(shop, DELETE_MUTATION, { id: groupId });

    if (data.sellingPlanGroupDelete.userErrors.length > 0) {
      throw new Error(
        data.sellingPlanGroupDelete.userErrors
          .map((error) => error.message)
          .join('; '),
      );
    }
  } catch (error) {
    throw new Error(formatShopifyError(error));
  }
}

function sellingPlanGroupIdKeys(groupId: string): string[] {
  const keys = new Set<string>([groupId]);
  const numeric = groupId.includes('/') ? groupId.split('/').pop() : groupId;
  if (numeric) {
    keys.add(numeric);
    keys.add(`gid://shopify/SellingPlanGroup/${numeric}`);
  }
  return [...keys];
}

/**
 * Delete Retain-stamped Shopify selling plan groups that are not linked to an
 * active Retain plan. Prevents orphaned purchase options on the storefront.
 */
export async function reconcileRetainSellingPlanGroups(
  shop: Shop,
): Promise<{ kept: number; deleted: string[] }> {
  const activePlans = await prisma.subscriptionPlan.findMany({
    where: {
      shopId: shop.id,
      status: PlanStatus.active,
      shopifySellingPlanGroupId: { not: null },
    },
    select: { shopifySellingPlanGroupId: true },
  });

  const activeKeys = new Set<string>();
  for (const plan of activePlans) {
    const groupId = plan.shopifySellingPlanGroupId;
    if (!groupId) continue;
    for (const key of sellingPlanGroupIdKeys(groupId)) {
      activeKeys.add(key);
    }
  }

  const deleted: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: {
      sellingPlanGroups: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{ id: string; appId: string | null }>;
      };
    } = await shopifyAdminGraphql(
      shop,
      `#graphql
        query RetainSellingPlanGroups($cursor: String) {
          sellingPlanGroups(first: 50, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              appId
            }
          }
        }
      `,
      { cursor },
    );

    for (const group of data.sellingPlanGroups.nodes) {
      if (group.appId !== RETAIN_SELLING_PLAN_APP_ID) {
        continue;
      }

      const isActive = sellingPlanGroupIdKeys(group.id).some((key) =>
        activeKeys.has(key),
      );
      if (isActive) {
        continue;
      }

      await deleteSellingPlanGroup(shop, group.id);
      deleted.push(group.id);
    }

    hasNextPage = data.sellingPlanGroups.pageInfo.hasNextPage;
    cursor = data.sellingPlanGroups.pageInfo.endCursor;
  }

  return { kept: activePlans.length, deleted };
}
