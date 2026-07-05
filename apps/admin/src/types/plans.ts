export type FrequencyUnit = 'day' | 'week' | 'month' | 'year';

export type PlanFrequency = {
  interval: number;
  unit: FrequencyUnit;
  discountPercent?: number | null;
  prepaidBillingInterval?: number | null;
};

export type BoxSlotConfig = {
  id: string;
  label?: string | null;
  required?: boolean;
};

export type BoxConfig = {
  minItems: number;
  maxItems: number;
  allowSwaps: boolean;
  slots: BoxSlotConfig[];
  eligibleProductIds?: string[];
};

export type PlanType = 'standard' | 'prepaid' | 'box';
export type PricingStrategy = 'percentage_discount' | 'fixed_price' | 'tiered';
export type PlanStatus = 'active' | 'paused' | 'archived';

export type SubscriptionPlan = {
  id: string;
  shopId: string;
  shopifySellingPlanGroupId?: string | null;
  name: string;
  description?: string | null;
  status: PlanStatus;
  planType: PlanType;
  frequencies: PlanFrequency[];
  minimumCommitment?: number | null;
  trialPeriodDays: number;
  pricingStrategy: PricingStrategy;
  discountValue?: number | null;
  boxConfig?: BoxConfig | null;
  productIds: string[];
  collectionIds: string[];
  subscriberCount: number;
  revenue: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanInput = {
  name: string;
  description?: string | null;
  planType: PlanType;
  frequencies: PlanFrequency[];
  minimumCommitment?: number | null;
  trialPeriodDays?: number | null;
  pricingStrategy: PricingStrategy;
  discountValue?: number | null;
  boxConfig?: BoxConfig | null;
  productIds?: string[];
  collectionIds?: string[];
};

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredImageUrl?: string | null;
  variants: Array<{ id: string; title: string; price: string }>;
};

export type ShopifyCollection = {
  id: string;
  title: string;
  handle: string;
};
