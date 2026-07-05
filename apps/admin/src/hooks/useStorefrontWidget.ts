import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '../lib/api';

export type StorefrontWidgetStatus = 'active' | 'inactive' | 'unknown';
export type StorefrontWidgetSource = 'retain_block' | 'theme_native';

export type StorefrontWidget = {
  status: StorefrontWidgetStatus;
  source?: StorefrontWidgetSource | null;
  themeName?: string | null;
  blockHandle: string;
  deepLinkUrl: string;
};

const STOREFRONT_WIDGET_QUERY = `
  query StorefrontWidget {
    storefrontWidget {
      status
      source
      themeName
      blockHandle
      deepLinkUrl
    }
  }
`;

export function useStorefrontWidget() {
  return useQuery({
    queryKey: ['storefrontWidget'],
    queryFn: async () => {
      const data = await graphqlRequest<{ storefrontWidget: StorefrontWidget }>(
        STOREFRONT_WIDGET_QUERY,
      );
      return data.storefrontWidget;
    },
    staleTime: 0,
  });
}
