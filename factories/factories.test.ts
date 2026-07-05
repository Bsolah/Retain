import { describe, expect, it } from 'vitest';
import {
  buildContract,
  buildCustomer,
  buildShop,
} from '../../factories/index.js';

describe('test factories', () => {
  it('buildShop generates unique domains', () => {
    const shopA = buildShop();
    const shopB = buildShop();
    expect(shopA.shopifyDomain).not.toBe(shopB.shopifyDomain);
    expect(shopA.status).toBe('active');
  });

  it('buildCustomer links to shop', () => {
    const shop = buildShop();
    const customer = buildCustomer(shop.id);
    expect(customer.shopId).toBe(shop.id);
    expect(customer.email).toMatch(/@test\.example$/);
  });

  it('buildContract includes line items and billing date', () => {
    const shop = buildShop();
    const customer = buildCustomer(shop.id);
    const contract = buildContract(shop.id, customer.id, 'plan-1');
    expect(contract.shopId).toBe(shop.id);
    expect(contract.customerId).toBe(customer.id);
    expect(Array.isArray(contract.lineItems)).toBe(true);
    expect(contract.nextBillingDate).toBeInstanceOf(Date);
  });
});
