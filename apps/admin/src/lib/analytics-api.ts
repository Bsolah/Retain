import { ApiError } from './api';
import { getShopDomain, resolveApiUrl, setSession } from './session';
import type {
  AiPerformance,
  CohortRow,
  DashboardOverview,
  DateRangeKey,
  SubscriberDetail,
  SubscriberRow,
} from '../types/analytics';

const API_URL = resolveApiUrl();

async function mintToken(): Promise<string> {
  const shop = getShopDomain();
  if (!shop) {
    throw new ApiError('Missing shop session', 'UNAUTHENTICATED');
  }
  const response = await fetch(`${API_URL}/auth/session-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shop }),
  });
  const payload = (await response.json()) as {
    token?: string;
    shop?: { id: string; shopifyDomain: string };
    message?: string;
    code?: string;
  };
  if (!response.ok || !payload.token || !payload.shop) {
    throw new ApiError(
      payload.message ?? 'Unable to create session token',
      payload.code ?? 'UNAUTHENTICATED',
    );
  }
  setSession({
    token: payload.token,
    shopDomain: payload.shop.shopifyDomain,
    shopId: payload.shop.id,
  });
  return payload.token;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await mintToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new ApiError(payload.message ?? 'Request failed', payload.code);
  }
  return payload;
}

export async function fetchDashboardOverview(params: {
  range: DateRangeKey;
  start?: string;
  end?: string;
  growthDays?: 30 | 90 | 365;
}): Promise<DashboardOverview> {
  const search = new URLSearchParams({ range: params.range });
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  if (params.growthDays) search.set('growthDays', String(params.growthDays));
  return adminFetch(`/admin/analytics/overview?${search}`);
}

export async function fetchCohorts(params?: {
  channel?: string;
  product?: string;
  geography?: string;
  discount?: string;
}): Promise<{
  cohorts: CohortRow[];
  filters: {
    channels: string[];
    products: string[];
    geographies: string[];
    discounts: Array<{ label: string; value: string }>;
  };
}> {
  const search = new URLSearchParams();
  if (params?.channel) search.set('channel', params.channel);
  if (params?.product) search.set('product', params.product);
  if (params?.geography) search.set('geography', params.geography);
  if (params?.discount) search.set('discount', params.discount);
  const qs = search.toString();
  return adminFetch(`/admin/analytics/cohorts${qs ? `?${qs}` : ''}`);
}

export async function fetchSubscribers(params: {
  search?: string;
  statuses?: string[];
  riskLevels?: string[];
  planId?: string;
  frequency?: string;
  nextChargeFrom?: string;
  nextChargeTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  total: number;
  limit: number;
  offset: number;
  subscribers: SubscriberRow[];
}> {
  const search = new URLSearchParams();
  if (params.search) search.set('search', params.search);
  if (params.statuses?.length)
    search.set('statuses', params.statuses.join(','));
  if (params.riskLevels?.length) {
    search.set('riskLevels', params.riskLevels.join(','));
  }
  if (params.planId) search.set('planId', params.planId);
  if (params.frequency) search.set('frequency', params.frequency);
  if (params.nextChargeFrom)
    search.set('nextChargeFrom', params.nextChargeFrom);
  if (params.nextChargeTo) search.set('nextChargeTo', params.nextChargeTo);
  if (params.limit != null) search.set('limit', String(params.limit));
  if (params.offset != null) search.set('offset', String(params.offset));
  return adminFetch(`/admin/analytics/subscribers?${search}`);
}

export async function fetchSubscriberDetail(
  contractId: string,
): Promise<SubscriberDetail> {
  return adminFetch(`/admin/analytics/subscribers/${contractId}`);
}

export async function bulkSubscriberAction(body: {
  contractIds: string[];
  action: string;
  durationDays?: number;
  reason?: string;
  tag?: string;
}) {
  return adminFetch<{
    results: Array<{ id: string; ok: boolean; error?: string }>;
  }>('/admin/analytics/subscribers/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function addSubscriberNote(contractId: string, note: string) {
  return adminFetch(`/admin/analytics/subscribers/${contractId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function createManualIntervention(
  contractId: string,
  input: {
    interventionType: string;
    subject?: string;
    body?: string;
    offerValue?: Record<string, unknown>;
  },
) {
  return adminFetch(
    `/admin/analytics/subscribers/${contractId}/interventions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function fetchAiPerformance(): Promise<AiPerformance> {
  return adminFetch('/admin/analytics/ai');
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const text = value == null ? '' : String(value);
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
