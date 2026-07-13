export type DateRangeKey = '7d' | '30d' | '90d' | 'ytd' | 'custom';

export type MetricValue = {
  value: number;
  changePct?: number;
  acceptanceRate?: number;
  sparkline?: Array<{ date: string; count: number }>;
};

export type DashboardOverview = {
  metrics: {
    activeSubscribers: MetricValue;
    mrr: MetricValue;
    arr: MetricValue;
    churnRate: MetricValue;
    ltv: MetricValue;
    newSubscribersThisMonth: MetricValue;
    revenueThisMonth: MetricValue;
    interventionsSent: MetricValue;
    interventionsAccepted: MetricValue;
    revenueSaved: MetricValue;
  };
  charts: {
    subscriberGrowth: Array<{ date: string; subscribers: number }>;
    mrrTrend: Array<{ date: string; mrr: number; churned: number }>;
    churnTrend: Array<{
      date: string;
      voluntary: number;
      involuntary: number;
    }>;
    revenueByPlanType: Array<{ name: string; value: number }>;
    topInterventions: Array<{ type: string; sent: number; accepted: number }>;
    cancelledVoluntary?: number;
    cancelledInvoluntary?: number;
  };
  range: { start: string; end: string };
  growthDays?: number;
};

export type CohortRow = {
  month: string;
  size: number;
  ltv: number;
  cacPaybackMonths: number | null;
  retention: number[];
};

export type SubscriberRow = {
  id: string;
  shopifyContractId: string;
  status: string;
  listStatus: string;
  healthStatus: string;
  riskScore: number;
  nextBillingDate: string | null;
  totalRevenue: number;
  plan: { id: string; name: string; planType: string };
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    lifetimeValue: number;
  };
  frequency: string;
  createdAt: string;
};

export type SubscriberDetail = {
  id: string;
  shopifyContractId: string;
  status: string;
  healthStatus: string;
  riskScore: number;
  nextBillingDate: string | null;
  lastBillingDate: string | null;
  totalCharges: number;
  chargeStatus:
    | 'scheduled'
    | 'due'
    | 'overdue'
    | 'paused'
    | 'cancelled'
    | 'payment_failed'
    | 'pending_payment';
  lastChargeTaken: boolean;
  latestOrder: {
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    currency: string;
    billingCycle: number;
    createdAt: string;
  } | null;
  subscription: {
    planName: string;
    planType: string;
    billingFrequency: string;
    deliveryFrequency: string;
    products: Array<{
      productId: string | null;
      variantId: string | null;
      quantity: number;
      unitPrice: number | null;
      title: string;
    }>;
    totalCharges: number;
    consecutiveSkips: number;
  };
  automaticRetries: {
    enabled: true;
    active: boolean;
    startedAt: string | null;
    failureCode: string | null;
    cardBrand: string | null;
    paymentFailureCount: number;
    completedSteps: number[];
    nextRetryAt: string | null;
    nextStepDay: number | null;
    schedule: Array<{ day: number; retry: boolean; channels: string[] }>;
  };
  paymentHistory: Array<{
    id: string;
    kind: 'order' | 'billing_event';
    status: string;
    amount: number;
    currency: string;
    orderNumber: string | null;
    billingCycle: number | null;
    createdAt: string;
    detail: string | null;
  }>;
  totalRevenue: number;
  createdAt: string;
  plan: { id: string; name: string; planType: string };
  customer: SubscriberRow['customer'] & { address?: string | null };
  frequency: string;
  tenureDays: number;
  timeline: Array<{
    id: string;
    type: string;
    subtype: string | null;
    payload: unknown;
    createdAt: string;
  }>;
  riskFactors: Array<{ feature: string; value: number; contribution: number }>;
  interventions: Array<{
    id: string;
    type: string;
    status: string;
    outcome: string | null;
    subject: string | null;
    revenueImpact: number | null;
    createdAt: string;
    respondedAt: string | null;
  }>;
  notes: Array<{ id: string; note: string; createdAt: string }>;
};

export type AiPerformance = {
  activeModel: {
    version: string;
    metrics: {
      precision: number;
      recall: number;
      f1: number;
      auc: number;
    };
    isActive: boolean;
    rolloutPercentage: number;
    createdAt: string;
  } | null;
  interventionSuccess: Array<{
    type: string;
    sent: number;
    accepted: number;
    successRate: number;
  }>;
  revenueSaved: number;
  featureImportance: Array<{ feature: string; importance: number }>;
  featureImportanceEstimated?: boolean;
  modelHistory: Array<{
    version: string;
    isActive: boolean;
    rolloutPercentage: number;
    metrics: Record<string, number>;
    createdAt: string;
    path: string;
  }>;
};

export type AiStatus = {
  status: 'ok' | 'degraded' | 'down' | string;
  ai: {
    liveness: { status: string; timestamp?: string } | null;
    livenessError: string | null;
    featuresHealth: {
      status: string;
      database: string;
      redis: string;
    } | null;
    featuresError: string | null;
  };
  lastPipelineRun: {
    ran_at?: string;
    shops_processed?: number;
    contracts_scored?: number;
    interventions_created?: number;
    processing_time_ms?: number;
  } | null;
  activeModel: {
    version: string;
    rolloutPercentage: number;
    createdAt: string;
  } | null;
  settings: {
    autoInterventionsEnabled: boolean;
  };
};
