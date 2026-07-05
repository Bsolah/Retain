import { jest } from '@jest/globals';
import { buildShop } from '../../../../../../factories/shop.js';
import { encrypt } from '../../../lib/encryption.js';
import {
  exchangeAuthorizationCode,
  fetchShopIdentity,
  shopifyAdminGraphql,
  ShopifyClientError,
  SHOPIFY_API_VERSION,
} from '../../../services/shopify-client.js';

const shop = buildShop({
  shopifyDomain: 'mock-store.myshopify.com',
  accessToken: encrypt('shpat_test_token_12345'),
});

const fetchMock = jest.fn<typeof fetch>();

describe('Shopify client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('shopifyAdminGraphql', () => {
    it('returns data on successful GraphQL response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { shop: { name: 'Mock Store' } } }),
      } as Response);

      const result = await shopifyAdminGraphql<{ shop: { name: string } }>(
        shop,
        'query { shop { name } }',
      );

      expect(result.shop.name).toBe('Mock Store');
    });

    it('throws ShopifyClientError on HTTP failure', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response);

      await expect(
        shopifyAdminGraphql(shop, 'query { shop { name } }'),
      ).rejects.toThrow(ShopifyClientError);
    });

    it('throws on GraphQL errors array', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'Access denied for subscriptionContract field' }],
        }),
      } as Response);

      await expect(
        shopifyAdminGraphql(shop, 'query { shop { name } }'),
      ).rejects.toThrow(/Access denied/);
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('exchanges OAuth code for access token', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'shpat_new_token',
          scope: 'read_products',
        }),
      } as Response);

      const result = await exchangeAuthorizationCode({
        shopDomain: shop.shopifyDomain,
        code: 'auth-code-123',
      });

      expect(result.access_token).toBe('shpat_new_token');
      expect(fetchMock.mock.calls[0]?.[0]).toContain(
        '/admin/oauth/access_token',
      );
    });

    it('throws on failed token exchange', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      } as Response);

      await expect(
        exchangeAuthorizationCode({
          shopDomain: shop.shopifyDomain,
          code: 'bad-code',
        }),
      ).rejects.toThrow(/Token exchange failed/);
    });
  });

  describe('fetchShopIdentity', () => {
    it('returns shop identity from GraphQL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            shop: {
              id: 'gid://shopify/Shop/1',
              name: 'Mock Store',
              myshopifyDomain: shop.shopifyDomain,
            },
          },
        }),
      } as Response);

      const identity = await fetchShopIdentity(
        shop.shopifyDomain,
        'shpat_test_token',
      );

      expect(identity.id).toBe('gid://shopify/Shop/1');
      expect(fetchMock.mock.calls[0]?.[0]).toContain(
        `/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      );
    });
  });
});
