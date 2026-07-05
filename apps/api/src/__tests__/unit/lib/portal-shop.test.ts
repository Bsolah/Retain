import { normalizeShopDomain } from '../../../middleware/shopify.js';
import { portalLoginRedirectUrl } from '../../../lib/portal-shop.js';

describe('portal shop helpers', () => {
  it('normalizes valid myshopify domains', () => {
    expect(normalizeShopDomain('Cool-Store.myshopify.com')).toBe(
      'cool-store.myshopify.com',
    );
  });

  it('rejects invalid shop domains', () => {
    expect(normalizeShopDomain('not-a-shop.com')).toBeNull();
    expect(normalizeShopDomain('')).toBeNull();
  });

  it('builds portal login redirect with shop and error', () => {
    const url = new URL(
      portalLoginRedirectUrl('demo.myshopify.com', 'missing_shop'),
    );
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('shop')).toBe('demo.myshopify.com');
    expect(url.searchParams.get('error')).toBe('missing_shop');
  });
});
