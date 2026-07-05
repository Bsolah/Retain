import { userInputError } from '../lib/graphql-errors.js';

const FREQUENCY_UNITS = new Set(['day', 'week', 'month', 'year']);

export type PlanFrequencyInput = {
  interval: number;
  unit: string;
  discountPercent?: number | null;
  prepaidBillingInterval?: number | null;
};

export type ValidatedFrequency = {
  interval: number;
  unit: 'day' | 'week' | 'month' | 'year';
  discountPercent?: number | null;
  prepaidBillingInterval?: number | null;
};

export type BoxConfigInput = {
  minItems?: number | null;
  maxItems?: number | null;
  allowSwaps?: boolean | null;
  slots?: Array<{
    id: string;
    label?: string | null;
    required?: boolean | null;
  }> | null;
  eligibleProductIds?: string[] | null;
};

export type ValidatedBoxConfig = {
  minItems: number;
  maxItems: number;
  allowSwaps: boolean;
  slots: Array<{ id: string; label: string | null; required: boolean }>;
  eligibleProductIds: string[];
};

export function validateFrequencies(
  frequencies: PlanFrequencyInput[] | null | undefined,
  planType: 'standard' | 'prepaid' | 'box' = 'standard',
): ValidatedFrequency[] {
  if (!frequencies || frequencies.length === 0) {
    throw userInputError('At least one frequency is required');
  }

  return frequencies.map((frequency, index) => {
    const interval = frequency.interval;
    const unit = frequency.unit;

    if (!Number.isInteger(interval) || interval < 1 || interval > 52) {
      throw userInputError(
        `frequencies[${index}].interval must be an integer between 1 and 52`,
      );
    }

    if (!FREQUENCY_UNITS.has(unit)) {
      throw userInputError(
        `frequencies[${index}].unit must be one of day, week, month, year`,
      );
    }

    if (
      frequency.discountPercent != null &&
      (frequency.discountPercent < 0 || frequency.discountPercent > 100)
    ) {
      throw userInputError(
        `frequencies[${index}].discountPercent must be between 0 and 100`,
      );
    }

    let prepaidBillingInterval = frequency.prepaidBillingInterval ?? null;

    if (planType === 'prepaid') {
      if (
        prepaidBillingInterval == null ||
        !Number.isInteger(prepaidBillingInterval) ||
        prepaidBillingInterval < interval
      ) {
        throw userInputError(
          `frequencies[${index}].prepaidBillingInterval must be an integer >= delivery interval (${interval})`,
        );
      }
      if (prepaidBillingInterval % interval !== 0) {
        throw userInputError(
          `frequencies[${index}].prepaidBillingInterval must be a multiple of the delivery interval (${interval})`,
        );
      }
    } else {
      prepaidBillingInterval = null;
    }

    return {
      interval,
      unit: unit as ValidatedFrequency['unit'],
      discountPercent: frequency.discountPercent,
      prepaidBillingInterval,
    };
  });
}

export function validateBoxConfig(
  boxConfig: BoxConfigInput | null | undefined,
  planType: string,
  productIds: string[],
  collectionIds: string[] = [],
): ValidatedBoxConfig | null {
  if (planType !== 'box') {
    return null;
  }

  if (!boxConfig) {
    throw userInputError('boxConfig is required for box plans');
  }

  const minItems = boxConfig.minItems ?? null;
  const maxItems = boxConfig.maxItems ?? null;

  if (
    minItems == null ||
    maxItems == null ||
    !Number.isInteger(minItems) ||
    !Number.isInteger(maxItems) ||
    minItems < 1 ||
    maxItems < minItems
  ) {
    throw userInputError(
      'boxConfig.minItems and boxConfig.maxItems are required (minItems >= 1, maxItems >= minItems)',
    );
  }

  if (maxItems > 20) {
    throw userInputError('boxConfig.maxItems cannot exceed 20');
  }

  const slots = (boxConfig.slots ?? []).map((slot, index) => {
    const id = slot.id?.trim();
    if (!id) {
      throw userInputError(`boxConfig.slots[${index}].id is required`);
    }
    return {
      id,
      label: slot.label?.trim() || null,
      required: Boolean(slot.required),
    };
  });

  if (slots.length === 0) {
    for (let i = 0; i < minItems; i += 1) {
      slots.push({
        id: `slot-${i + 1}`,
        label: `Item ${i + 1}`,
        required: i < minItems,
      });
    }
  }

  if (slots.length < minItems) {
    throw userInputError(
      `boxConfig needs at least ${minItems} slot(s); got ${slots.length}`,
    );
  }

  if (slots.length > maxItems) {
    throw userInputError(
      `boxConfig slots (${slots.length}) cannot exceed maxItems (${maxItems})`,
    );
  }

  const eligibleProductIds =
    boxConfig.eligibleProductIds && boxConfig.eligibleProductIds.length > 0
      ? boxConfig.eligibleProductIds
      : productIds;

  if (eligibleProductIds.length < minItems && collectionIds.length === 0) {
    throw userInputError(
      `Box plans need at least ${minItems} eligible product(s); select more products in step 3`,
    );
  }

  return {
    minItems,
    maxItems,
    allowSwaps: boxConfig.allowSwaps ?? true,
    slots,
    eligibleProductIds,
  };
}

export function validatePlanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    throw userInputError('name must be between 1 and 120 characters');
  }
  return trimmed;
}
