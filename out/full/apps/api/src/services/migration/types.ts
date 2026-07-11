import type { MigrationPlatformName } from '@retain/shared';

export type MigrationCredentials = {
  apiKey?: string;
  apiSecret?: string;
  csvData?: string;
};

export type SourceCustomer = {
  sourceId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
};

export type SourceContract = {
  sourceId: string;
  sourceCustomerId: string;
  status: string;
  productTitle?: string;
  variantId?: string;
  quantity?: number;
  price?: number;
  currency?: string;
  nextBillingDate?: string | null;
  billingInterval?: string;
  billingIntervalCount?: number;
  totalRevenue?: number;
  createdAt?: string;
  address?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type DiscoveryResult = {
  customers: SourceCustomer[];
  contracts: SourceContract[];
  totalRevenue: number;
};

export type PlatformAdapter = {
  platform: MigrationPlatformName;
  discover(credentials: MigrationCredentials): Promise<DiscoveryResult>;
};

export function estimateDurationMinutes(contractCount: number): number {
  const perRecordSeconds = 2;
  return Math.max(1, Math.ceil((contractCount * perRecordSeconds) / 60));
}

export function buildPreview(result: DiscoveryResult) {
  return {
    totalContracts: result.contracts.length,
    totalCustomers: result.customers.length,
    totalRevenue: Number(result.totalRevenue.toFixed(2)),
    estimatedDurationMinutes: estimateDurationMinutes(result.contracts.length),
  };
}
