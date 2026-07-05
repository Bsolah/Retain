import type { GraphQLContext } from '../../context.js';
import { getStorefrontWidgetInfo } from '../../services/storefront-widget.js';
import { requireShop } from '../auth.js';

export const storefrontQueries = {
  storefrontWidget: async (
    _parent: unknown,
    _args: Record<string, never>,
    context: GraphQLContext,
  ) => {
    const shop = requireShop(context);
    return getStorefrontWidgetInfo(shop);
  },
};
