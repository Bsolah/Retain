import type {
  Shop,
  SubscriptionPlan as DbSubscriptionPlan,
} from '@retain/database';
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
  pricingStrategy: string;
  discountValue?: number | null;
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
    | 'pricingStrategy'
    | 'discountValue'
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
    pricingStrategy: plan.pricingStrategy,
    discountValue:
      plan.discountValue == null ? null : Number(plan.discountValue),
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

  return input.frequencies.map((frequency) => {
    const interval = INTERVAL_MAP[frequency.unit];
    const discountPercent =
      frequency.discountPercent ??
      (input.pricingStrategy === 'percentage_discount'
        ? (input.discountValue ?? 0)
        : 0);

    const pricingPolicies =
      input.pricingStrategy === 'fixed_price' && input.discountValue != null
        ? [
            {
              fixed: {
                adjustmentType: 'PRICE',
                adjustmentValue: {
                  fixedValue: input.discountValue,
                },
              },
            },
          ]
        : [
            {
              fixed: {
                adjustmentType: 'PERCENTAGE',
                adjustmentValue: {
                  percentage: discountPercent,
                },
              },
            },
          ];

    const deliveryLabel = optionValue(frequency);
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
    const data = await shopifyAdminGraphql<{
      collection: {
        products: {
          edges: Array<{ node: { id: string } }>;
        };
      } | null;
    }>(
      shop,
      `#graphql
        query CollectionProducts($id: ID!) {
          collection(id: $id) {
            products(first: 100) {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      `,
      { id: collectionId },
    );

    for (const edge of data.collection?.products.edges ?? []) {
      productIds.push(edge.node.id);
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

const GROUP_PLANS_QUERY = `#graphql
  query SellingPlanGroupPlans($id: ID!) {
    sellingPlanGroup(id: $id) {
      sellingPlans(first: 50) {
        nodes {
          id
        }
      }
    }
  }
`;

export async function fetchSellingPlanIdsForGroup(
  shop: Shop,
  groupId: string,
): Promise<string[]> {
  const data = await shopifyAdminGraphql<{
    sellingPlanGroup: {
      sellingPlans: { nodes: Array<{ id: string }> };
    } | null;
  }>(shop, GROUP_PLANS_QUERY, { id: groupId });

  return data.sellingPlanGroup?.sellingPlans.nodes.map((plan) => plan.id) ?? [];
}

/** Replace all selling plans in a group so storefront options match Retain exactly. */
export function buildSellingPlanReplaceInput(
  input: SellingPlanCreateInput,
  existingPlanIds: string[],
): Record<string, unknown> {
  return {
    name: input.name,
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

export async function updateSellingPlanGroup(
  shop: Shop,
  groupId: string,
  input: SellingPlanCreateInput,
): Promise<void> {
  try {
    const existingPlanIds = await fetchSellingPlanIdsForGroup(shop, groupId);

    const data = await shopifyAdminGraphql<{
      sellingPlanGroupUpdate: {
        sellingPlanGroup: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(shop, UPDATE_MUTATION, {
      id: groupId,
      input: buildSellingPlanReplaceInput(input, existingPlanIds),
    });

    if (data.sellingPlanGroupUpdate.userErrors.length > 0) {
      throw new Error(
        data.sellingPlanGroupUpdate.userErrors
          .map((error) => error.message)
          .join('; '),
      );
    }

    // Attach any newly selected products (collections expanded to products).
    const productIds = await resolveResourceProductIds(shop, input);
    if (productIds.length > 0) {
      const addResult = await shopifyAdminGraphql<{
        sellingPlanGroupAddProducts: {
          userErrors: Array<{ message: string }>;
        };
      }>(shop, ADD_PRODUCTS_MUTATION, { id: groupId, productIds });

      if (addResult.sellingPlanGroupAddProducts.userErrors.length > 0) {
        throw new Error(
          addResult.sellingPlanGroupAddProducts.userErrors
            .map((error) => error.message)
            .join('; '),
        );
      }
    }
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
