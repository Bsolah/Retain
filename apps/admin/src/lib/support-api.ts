import { ApiError } from './api';
import { getShopDomain, resolveApiUrl, setSession } from './session';

const API_URL = resolveApiUrl();

export type SupportCategory =
  'bug' | 'question' | 'feature' | 'billing' | 'other';

export type SupportContext = {
  shopDomain: string;
  shopName: string;
  replyEmail: string;
  inboxEmail: string | null;
  bookingUrl: string | null;
};

export type SubmitSupportInput = {
  category: SupportCategory;
  message: string;
  replyEmail: string;
  subject?: string;
  pageUrl?: string;
};

export type SubmitSupportResult = {
  ok: true;
  sent: boolean;
  dryRun: boolean;
};

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

export async function fetchSupportContext(): Promise<SupportContext> {
  return adminFetch('/admin/support/context');
}

export async function submitSupportRequest(
  input: SubmitSupportInput,
): Promise<SubmitSupportResult> {
  return adminFetch('/admin/support/contact', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
