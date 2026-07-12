import { ApiError } from './api';
import { getShopDomain, resolveApiUrl, setSession } from './session';

const API_URL = resolveApiUrl();

export type ManualSubscriptionAddress = {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
};

export type ManualSubscriptionLine = {
  variantId: string;
  quantity: number;
  price: string;
  title?: string;
};

export type ManualSubscriptionPayload = {
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  billingAddress: ManualSubscriptionAddress;
  shippingSameAsBilling: boolean;
  shippingAddress?: ManualSubscriptionAddress;
  planId: string;
  frequencyIndex: number;
  lines: ManualSubscriptionLine[];
  chargeTiming: 'now' | 'future';
  nextBillingDate?: string;
  paymentMode?: 'saved_card' | 'payment_link';
  paymentMethodId?: string;
  createUnpaidOrder?: boolean;
  sendPaymentLinkEmail?: boolean;
  deliveryPrice?: number;
  currencyCode?: string;
};

export type CustomerLookupResult = {
  found: boolean;
  customer: {
    shopifyCustomerId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  } | null;
  paymentMethods: Array<{
    id: string;
    brand: string;
    lastDigits: string;
    expiryMonth: number | null;
    expiryYear: number | null;
    name: string | null;
  }>;
};

export type ManualSubscriptionResult = {
  contractId: string;
  shopifyContractId: string;
  customerId: string;
  billingAttemptId: string | null;
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  paymentLink: string | null;
  paymentEmailSent: boolean;
  nextBillingDate: string;
  billedNow: boolean;
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

export function lookupManualSubscriptionCustomer(
  email: string,
): Promise<CustomerLookupResult> {
  return adminFetch(
    `/admin/manual-subscriptions/customer-lookup?email=${encodeURIComponent(email)}`,
  );
}

export function createManualSubscription(
  payload: ManualSubscriptionPayload,
): Promise<ManualSubscriptionResult> {
  return adminFetch('/admin/manual-subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
