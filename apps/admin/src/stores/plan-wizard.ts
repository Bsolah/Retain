import { create } from 'zustand';
import type {
  BoxConfig,
  BoxSlotConfig,
  FrequencyUnit,
  PlanFrequency,
  PlanType,
  PricingStrategy,
} from '../types/plans';

export type WizardStep = 0 | 1 | 2;

const defaultBoxConfig = (): BoxConfig => ({
  minItems: 3,
  maxItems: 5,
  allowSwaps: true,
  slots: [],
});

const defaultFrequency = (planType: PlanType): PlanFrequency => {
  const interval = 1;
  return {
    interval,
    unit: 'month' as FrequencyUnit,
    discountPercent: 10,
    ...(planType === 'prepaid' ? { prepaidBillingInterval: interval * 3 } : {}),
  };
};

type PlanWizardState = {
  step: WizardStep;
  name: string;
  description: string;
  planType: PlanType;
  pricingStrategy: PricingStrategy;
  discountValue: number;
  trialPeriodDays: number;
  minimumCommitment: number | null;
  frequencies: PlanFrequency[];
  boxConfig: BoxConfig | null;
  productIds: string[];
  collectionIds: string[];
  selectedProductTitles: Record<string, string>;
  selectedCollectionTitles: Record<string, string>;
  setStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setBasicInfo: (payload: {
    name: string;
    description: string;
    planType: PlanType;
    pricingStrategy: PricingStrategy;
    discountValue: number;
    trialPeriodDays: number;
    minimumCommitment: number | null;
  }) => void;
  setBoxConfig: (patch: Partial<BoxConfig>) => void;
  addBoxSlot: () => void;
  updateBoxSlot: (index: number, patch: Partial<BoxSlotConfig>) => void;
  removeBoxSlot: (index: number) => void;
  addFrequency: () => void;
  updateFrequency: (index: number, patch: Partial<PlanFrequency>) => void;
  removeFrequency: (index: number) => void;
  toggleProduct: (id: string, title: string) => void;
  toggleCollection: (id: string, title: string) => void;
  selectProducts: (products: Array<{ id: string; title: string }>) => void;
  clearProducts: () => void;
  loadFromPlan: (plan: {
    name: string;
    description?: string | null;
    planType: PlanType;
    pricingStrategy: PricingStrategy;
    discountValue?: number | null;
    trialPeriodDays: number;
    minimumCommitment?: number | null;
    frequencies: PlanFrequency[];
    boxConfig?: BoxConfig | null;
    productIds: string[];
    collectionIds: string[];
  }) => void;
  reset: () => void;
  toInput: () => {
    name: string;
    description: string;
    planType: PlanType;
    frequencies: PlanFrequency[];
    minimumCommitment: number | null;
    trialPeriodDays: number;
    pricingStrategy: PricingStrategy;
    discountValue: number;
    boxConfig?: BoxConfig | null;
    productIds: string[];
    collectionIds: string[];
  };
};

const initialState = {
  step: 0 as WizardStep,
  name: '',
  description: '',
  planType: 'standard' as PlanType,
  pricingStrategy: 'percentage_discount' as PricingStrategy,
  discountValue: 10,
  trialPeriodDays: 0,
  minimumCommitment: null as number | null,
  frequencies: [defaultFrequency('standard')],
  boxConfig: null as BoxConfig | null,
  productIds: [] as string[],
  collectionIds: [] as string[],
  selectedProductTitles: {} as Record<string, string>,
  selectedCollectionTitles: {} as Record<string, string>,
};

export const usePlanWizardStore = create<PlanWizardState>((set, get) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  nextStep: () =>
    set((state) => ({
      step: Math.min(2, state.step + 1) as WizardStep,
    })),
  prevStep: () =>
    set((state) => ({
      step: Math.max(0, state.step - 1) as WizardStep,
    })),
  setBasicInfo: (payload) =>
    set((state) => {
      const planTypeChanged = payload.planType !== state.planType;
      let frequencies = state.frequencies;
      let boxConfig = state.boxConfig;

      if (planTypeChanged) {
        if (payload.planType === 'prepaid') {
          frequencies = frequencies.map((frequency) => ({
            ...frequency,
            prepaidBillingInterval:
              frequency.prepaidBillingInterval ?? frequency.interval * 3,
          }));
        } else {
          frequencies = frequencies.map(
            ({ prepaidBillingInterval: _drop, ...frequency }) => frequency,
          );
        }

        if (payload.planType === 'box') {
          boxConfig = state.boxConfig ?? defaultBoxConfig();
        } else {
          boxConfig = null;
        }
      }

      return { ...payload, frequencies, boxConfig };
    }),
  setBoxConfig: (patch) =>
    set((state) => {
      if (!state.boxConfig) return state;
      const next = { ...state.boxConfig, ...patch };
      if (next.maxItems < next.minItems) {
        next.maxItems = next.minItems;
      }
      return { boxConfig: next };
    }),
  addBoxSlot: () =>
    set((state) => {
      if (!state.boxConfig) return state;
      if (state.boxConfig.slots.length >= state.boxConfig.maxItems) {
        return state;
      }
      const index = state.boxConfig.slots.length + 1;
      return {
        boxConfig: {
          ...state.boxConfig,
          slots: [
            ...state.boxConfig.slots,
            {
              id: `slot-${index}`,
              label: `Item ${index}`,
              required: index <= state.boxConfig.minItems,
            },
          ],
        },
      };
    }),
  updateBoxSlot: (index, patch) =>
    set((state) => {
      if (!state.boxConfig) return state;
      return {
        boxConfig: {
          ...state.boxConfig,
          slots: state.boxConfig.slots.map((slot, i) =>
            i === index ? { ...slot, ...patch } : slot,
          ),
        },
      };
    }),
  removeBoxSlot: (index) =>
    set((state) => {
      if (!state.boxConfig) return state;
      return {
        boxConfig: {
          ...state.boxConfig,
          slots: state.boxConfig.slots.filter((_, i) => i !== index),
        },
      };
    }),
  addFrequency: () =>
    set((state) => ({
      frequencies: [...state.frequencies, defaultFrequency(state.planType)],
    })),
  updateFrequency: (index, patch) =>
    set((state) => ({
      frequencies: state.frequencies.map((frequency, i) => {
        if (i !== index) return frequency;
        const next = { ...frequency, ...patch };
        if (
          state.planType === 'prepaid' &&
          patch.interval != null &&
          patch.prepaidBillingInterval == null &&
          (next.prepaidBillingInterval == null ||
            next.prepaidBillingInterval < next.interval)
        ) {
          next.prepaidBillingInterval = next.interval * 3;
        }
        return next;
      }),
    })),
  removeFrequency: (index) =>
    set((state) => ({
      frequencies: state.frequencies.filter((_, i) => i !== index),
    })),
  toggleProduct: (id, title) =>
    set((state) => {
      const exists = state.productIds.includes(id);
      if (exists) {
        const { [id]: _removed, ...rest } = state.selectedProductTitles;
        return {
          productIds: state.productIds.filter((value) => value !== id),
          selectedProductTitles: rest,
        };
      }
      return {
        productIds: [...state.productIds, id],
        selectedProductTitles: {
          ...state.selectedProductTitles,
          [id]: title,
        },
      };
    }),
  toggleCollection: (id, title) =>
    set((state) => {
      const exists = state.collectionIds.includes(id);
      if (exists) {
        const { [id]: _removed, ...rest } = state.selectedCollectionTitles;
        return {
          collectionIds: state.collectionIds.filter((value) => value !== id),
          selectedCollectionTitles: rest,
        };
      }
      return {
        collectionIds: [...state.collectionIds, id],
        selectedCollectionTitles: {
          ...state.selectedCollectionTitles,
          [id]: title,
        },
      };
    }),
  selectProducts: (products) =>
    set((state) => {
      const nextIds = new Set(state.productIds);
      const nextTitles = { ...state.selectedProductTitles };
      for (const product of products) {
        nextIds.add(product.id);
        nextTitles[product.id] = product.title;
      }
      return {
        productIds: [...nextIds],
        selectedProductTitles: nextTitles,
      };
    }),
  clearProducts: () =>
    set({
      productIds: [],
      selectedProductTitles: {},
    }),
  loadFromPlan: (plan) =>
    set({
      step: 0,
      name: plan.name,
      description: plan.description ?? '',
      planType: plan.planType,
      pricingStrategy: plan.pricingStrategy,
      discountValue: plan.discountValue ?? 10,
      trialPeriodDays: plan.trialPeriodDays,
      minimumCommitment: plan.minimumCommitment ?? null,
      frequencies:
        plan.frequencies.length > 0
          ? plan.frequencies
          : [defaultFrequency(plan.planType)],
      boxConfig:
        plan.planType === 'box'
          ? {
              minItems: plan.boxConfig?.minItems ?? 3,
              maxItems: plan.boxConfig?.maxItems ?? 5,
              allowSwaps: plan.boxConfig?.allowSwaps ?? true,
              slots: plan.boxConfig?.slots ?? [],
            }
          : null,
      productIds: plan.productIds,
      collectionIds: plan.collectionIds,
      selectedProductTitles: Object.fromEntries(
        plan.productIds.map((id) => [id, id]),
      ),
      selectedCollectionTitles: Object.fromEntries(
        plan.collectionIds.map((id) => [id, id]),
      ),
    }),
  reset: () => set(initialState),
  toInput: () => {
    const state = get();
    const frequencies = state.frequencies.map((frequency) => {
      const row: PlanFrequency = {
        interval: frequency.interval,
        unit: frequency.unit,
        discountPercent: frequency.discountPercent ?? state.discountValue,
      };
      if (state.planType === 'prepaid') {
        row.prepaidBillingInterval =
          frequency.prepaidBillingInterval ?? frequency.interval * 3;
      }
      return row;
    });

    const boxConfig =
      state.planType === 'box' && state.boxConfig
        ? {
            ...state.boxConfig,
            eligibleProductIds: state.productIds,
          }
        : null;

    return {
      name: state.name,
      description: state.description,
      planType: state.planType,
      frequencies,
      minimumCommitment: state.minimumCommitment,
      trialPeriodDays: state.trialPeriodDays,
      pricingStrategy: state.pricingStrategy,
      discountValue: state.discountValue,
      boxConfig,
      productIds: state.productIds,
      collectionIds: state.collectionIds,
    };
  },
}));
