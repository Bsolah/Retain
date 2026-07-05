import { describe, expect, it } from 'vitest';
import { validateBoxConfig, validateFrequencies } from './plan-validation.js';

describe('validateFrequencies', () => {
  it('requires prepaid billing interval >= delivery interval', () => {
    expect(() =>
      validateFrequencies(
        [{ interval: 1, unit: 'month', prepaidBillingInterval: 0 }],
        'prepaid',
      ),
    ).toThrow(/prepaidBillingInterval/);
  });

  it('requires prepaid billing interval to be a multiple of delivery interval', () => {
    expect(() =>
      validateFrequencies(
        [{ interval: 2, unit: 'month', prepaidBillingInterval: 5 }],
        'prepaid',
      ),
    ).toThrow(/multiple/);
  });

  it('accepts valid prepaid frequencies', () => {
    const result = validateFrequencies(
      [{ interval: 1, unit: 'month', prepaidBillingInterval: 3 }],
      'prepaid',
    );
    expect(result[0]?.prepaidBillingInterval).toBe(3);
  });

  it('strips prepaid billing for standard plans', () => {
    const result = validateFrequencies(
      [{ interval: 1, unit: 'month', prepaidBillingInterval: 3 }],
      'standard',
    );
    expect(result[0]?.prepaidBillingInterval).toBeNull();
  });
});

describe('validateBoxConfig', () => {
  it('requires box config for box plans', () => {
    expect(() => validateBoxConfig(null, 'box', ['p1', 'p2', 'p3'])).toThrow(
      /boxConfig is required/,
    );
  });

  it('auto-generates slots from minItems when none provided', () => {
    const result = validateBoxConfig(
      { minItems: 3, maxItems: 5, allowSwaps: true },
      'box',
      ['p1', 'p2', 'p3', 'p4'],
    );
    expect(result?.slots).toHaveLength(3);
    expect(result?.slots[0]?.id).toBe('slot-1');
  });

  it('requires enough eligible products', () => {
    expect(() =>
      validateBoxConfig({ minItems: 3, maxItems: 5 }, 'box', ['p1', 'p2']),
    ).toThrow(/at least 3 eligible product/);
  });
});
