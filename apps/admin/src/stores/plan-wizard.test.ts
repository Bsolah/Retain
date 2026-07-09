import { describe, expect, it, beforeEach } from 'vitest';
import { usePlanWizardStore } from '../stores/plan-wizard';

describe('usePlanWizardStore', () => {
  beforeEach(() => {
    usePlanWizardStore.getState().reset();
  });

  it('starts at step 0 with default frequency', () => {
    const state = usePlanWizardStore.getState();
    expect(state.step).toBe(0);
    expect(state.frequencies).toHaveLength(1);
    expect(state.frequencies[0]?.unit).toBe('month');
  });

  it('advances and retreats through wizard steps', () => {
    const store = usePlanWizardStore.getState();
    store.nextStep();
    expect(usePlanWizardStore.getState().step).toBe(1);
    store.nextStep();
    expect(usePlanWizardStore.getState().step).toBe(1);
    store.prevStep();
    expect(usePlanWizardStore.getState().step).toBe(0);
  });

  it('validates basic info and builds GraphQL input', () => {
    usePlanWizardStore.getState().setBasicInfo({
      name: 'Monthly Coffee',
      description: 'Fresh beans every month',
      planType: 'standard',
    });

    usePlanWizardStore.getState().addFrequency();
    usePlanWizardStore
      .getState()
      .toggleProduct('gid://shopify/Product/1', 'House Blend');

    const input = usePlanWizardStore.getState().toInput();

    expect(input.name).toBe('Monthly Coffee');
    expect(input.frequencies).toHaveLength(2);
    expect(input.productIds).toContain('gid://shopify/Product/1');
  });

  it('removes products and collections on toggle', () => {
    const store = usePlanWizardStore.getState();
    store.toggleCollection('gid://shopify/Collection/1', 'Best Sellers');
    expect(usePlanWizardStore.getState().collectionIds).toHaveLength(1);

    store.toggleCollection('gid://shopify/Collection/1', 'Best Sellers');
    expect(usePlanWizardStore.getState().collectionIds).toHaveLength(0);
  });

  it('selects multiple products at once', () => {
    usePlanWizardStore.getState().selectProducts([
      { id: 'gid://shopify/Product/1', title: 'Alpha' },
      { id: 'gid://shopify/Product/2', title: 'Beta' },
    ]);
    const state = usePlanWizardStore.getState();
    expect(state.productIds).toHaveLength(2);
    expect(state.selectedProductTitles['gid://shopify/Product/1']).toBe(
      'Alpha',
    );
  });

  it('builds prepaid input with billing interval', () => {
    usePlanWizardStore.getState().setBasicInfo({
      name: 'Quarterly Prepaid',
      description: 'Pay upfront',
      planType: 'prepaid',
    });
    usePlanWizardStore.getState().updateFrequency(0, {
      interval: 1,
      unit: 'month',
      prepaidBillingInterval: 3,
    });

    const input = usePlanWizardStore.getState().toInput();
    expect(input.frequencies[0]?.prepaidBillingInterval).toBe(3);
    expect(input.boxConfig).toBeNull();
  });

  it('builds box config with eligible products', () => {
    usePlanWizardStore.getState().setBasicInfo({
      name: 'Snack Box',
      description: 'Curated snacks',
      planType: 'box',
    });
    usePlanWizardStore.getState().toggleProduct('gid://shopify/Product/1', 'A');
    usePlanWizardStore.getState().toggleProduct('gid://shopify/Product/2', 'B');
    usePlanWizardStore.getState().toggleProduct('gid://shopify/Product/3', 'C');

    const input = usePlanWizardStore.getState().toInput();
    expect(input.boxConfig?.minItems).toBe(3);
    expect(input.boxConfig?.eligibleProductIds).toHaveLength(3);
  });

  it('loads an existing plan for editing', () => {
    usePlanWizardStore.getState().loadFromPlan({
      name: 'Weekly Box',
      description: 'Every week',
      planType: 'box',
      frequencies: [{ interval: 1, unit: 'week', discountPercent: 5 }],
      boxConfig: {
        minItems: 2,
        maxItems: 4,
        allowSwaps: true,
        slots: [{ id: 'slot-1', label: 'Snack', required: true }],
      },
      productIds: ['gid://shopify/Product/9'],
      collectionIds: [],
    });
    const state = usePlanWizardStore.getState();
    expect(state.name).toBe('Weekly Box');
    expect(state.boxConfig?.slots).toHaveLength(1);
    expect(state.productIds).toContain('gid://shopify/Product/9');
  });
});
