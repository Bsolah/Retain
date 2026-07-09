import { PlanStatus, prisma, type Shop } from '@retain/database';
import { shopifyAdminGraphql } from './shopify-client.js';

const METAFIELD_NAMESPACE = 'retain';
const ACTIVE_GROUP_IDS_KEY = 'active_selling_plan_group_ids';

const METAFIELDS_SET = `#graphql
  mutation RetainStorefrontMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Expand Admin GIDs to include numeric suffixes for tooling / debugging.
 *
 * Note: Liquid `selling_plan_group.id` is an opaque hex string and does NOT match
 * these Admin IDs. Storefront Liquid filters by `app_id == "retain"` instead;
 * archived plans are removed from products via hideSellingPlanGroupFromProducts.
 */
export function expandSellingPlanGroupIdsForStorefront(
  groupIds: string[],
): string[] {
  const ids = new Set<string>();
  for (const raw of groupIds) {
    if (!raw) continue;
    ids.add(raw);
    const numeric = raw.includes('/') ? raw.split('/').pop() : raw;
    if (numeric) {
      ids.add(numeric);
      if (!raw.startsWith('gid://')) {
        ids.add(`gid://shopify/SellingPlanGroup/${numeric}`);
      }
    }
  }
  return [...ids];
}

/**
 * Publish active Retain selling plan group IDs on the shop (Admin GIDs).
 * Kept for admin/debug consumers — Liquid storefront does not filter on this
 * because Liquid group ids are opaque hashes, not Admin GIDs.
 */
export async function syncRetainActiveSellingPlanGroupsMetafield(
  shop: Shop,
): Promise<string[]> {
  if (!shop.shopifyShopId) {
    throw new Error('Shop is missing shopifyShopId');
  }

  const activePlans = await prisma.subscriptionPlan.findMany({
    where: {
      shopId: shop.id,
      status: PlanStatus.active,
      shopifySellingPlanGroupId: { not: null },
    },
    select: { shopifySellingPlanGroupId: true },
    orderBy: { createdAt: 'asc' },
  });

  const rawGroupIds = activePlans
    .map((plan) => plan.shopifySellingPlanGroupId)
    .filter((id): id is string => Boolean(id));

  const groupIds = expandSellingPlanGroupIdsForStorefront(rawGroupIds);

  const result = await shopifyAdminGraphql<{
    metafieldsSet: {
      metafields: Array<{ id: string; key: string }>;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(shop, METAFIELDS_SET, {
    metafields: [
      {
        ownerId: shop.shopifyShopId,
        namespace: METAFIELD_NAMESPACE,
        key: ACTIVE_GROUP_IDS_KEY,
        type: 'json',
        value: JSON.stringify(groupIds),
      },
    ],
  });

  if (result.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      result.metafieldsSet.userErrors
        .map((error) =>
          error.field?.length
            ? `${error.field.join('.')}: ${error.message}`
            : error.message,
        )
        .join('; '),
    );
  }

  return groupIds;
}
