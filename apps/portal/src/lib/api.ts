const API_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');

export class PortalApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PortalApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    code?: string;
  };

  if (!response.ok) {
    throw new PortalApiError(
      payload.message ?? 'Request failed',
      payload.code,
      response.status,
    );
  }

  return payload;
}

export function startLogin(shop: string): void {
  const params = new URLSearchParams({ shop });
  window.location.href = `${API_URL}/portal/auth/start?${params.toString()}`;
}

export async function refreshSession() {
  return request<{ ok: boolean; expiresAt?: number; refreshed: boolean }>(
    '/portal/auth/refresh',
    { method: 'POST' },
  );
}

export async function logout() {
  return request<{ ok: boolean }>('/portal/auth/logout', { method: 'POST' });
}

export async function getSession() {
  return request<{
    authenticated: boolean;
    shopDomain?: string;
    expiresAt?: number;
  }>('/portal/auth/session');
}

export async function getSubscriptions() {
  return request<{
    customer: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    };
    paymentMethod: PaymentMethod | null;
    subscriptions: PortalSubscription[];
  }>('/portal/api/subscriptions');
}

export async function getSubscription(contractId: string) {
  return request<{ subscription: PortalSubscriptionDetail }>(
    `/portal/api/subscriptions/${contractId}`,
  );
}

export async function pauseSubscription(contractId: string, duration: number) {
  return request(`/portal/api/subscriptions/${contractId}/pause`, {
    method: 'POST',
    body: JSON.stringify({ duration }),
  });
}

export async function resumeSubscription(contractId: string) {
  return request(`/portal/api/subscriptions/${contractId}/resume`, {
    method: 'POST',
  });
}

export async function skipSubscription(contractId: string) {
  return request(`/portal/api/subscriptions/${contractId}/skip`, {
    method: 'POST',
  });
}

export async function swapSubscription(
  contractId: string,
  newProductId: string,
  newVariantId: string,
) {
  return request(`/portal/api/subscriptions/${contractId}/swap`, {
    method: 'POST',
    body: JSON.stringify({ newProductId, newVariantId }),
  });
}

export async function updateBoxItems(
  contractId: string,
  items: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    slot?: string;
  }>,
) {
  return request(`/portal/api/subscriptions/${contractId}/box-items`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function getCancelOffer(contractId: string, reason: string) {
  return request<{
    offer: { title: string; description: string; action: string };
    lifetimeValue: number;
  }>(
    `/portal/api/subscriptions/${contractId}/cancel-offer?reason=${encodeURIComponent(reason)}`,
  );
}

export async function cancelSubscription(
  contractId: string,
  reason: string,
  feedback?: string,
) {
  return request(`/portal/api/subscriptions/${contractId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason, feedback }),
  });
}

export type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
};

export type SwapOption = {
  productId: string;
  variantId: string;
  label: string;
};

export type PortalSubscription = {
  id: string;
  shopifyContractId: string;
  status: string;
  nextBillingDate?: string | null;
  planName: string;
  planType: string;
  productName?: string;
  imageUrl?: string | null;
  currencyCode?: string;
  unitPrice?: number;
  frequency?: {
    interval?: string;
    intervalCount?: number;
  } | null;
  lines?: unknown;
  swapOptions?: SwapOption[];
  health: 'green' | 'yellow' | 'red';
  consecutiveSkips: number;
  totalCharges: number;
  boxItems?: unknown;
  boxConfig?: {
    minItems?: number | null;
    maxItems?: number | null;
    allowSwaps?: boolean | null;
    slots?: Array<{
      id: string;
      label?: string | null;
      required?: boolean | null;
    }> | null;
    eligibleProductIds?: string[] | null;
  } | null;
  shippingAddress?: unknown;
};

export type PortalSubscriptionDetail = PortalSubscription & {
  billingPolicy?: unknown;
  paymentMethod?: PaymentMethod | null;
  addOns?: Array<SwapOption & { price?: number }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    currency: string;
    trackingNumber?: string | null;
    createdAt: string;
  }>;
};
