export const WEBHOOK_QUEUES = {
  critical: 'webhooks-critical',
  high: 'webhooks-high',
  medium: 'webhooks-medium',
  low: 'webhooks-low',
  legacy: 'shopify-webhooks',
  dlq: 'webhooks-dlq',
  cleanup: 'shop-cleanup',
} as const;

export type WebhookPriority = keyof typeof WEBHOOK_QUEUES;

export type ShopifyWebhookJob = {
  topic: string;
  shopDomain: string;
  webhookId: string;
  payload: unknown;
  receivedAt: string;
  hmac?: string;
  rawBody?: string;
};

export type ShopCleanupJob = {
  shopId: string;
  shopifyDomain: string;
  reason: 'app_uninstalled';
  scheduledAt: string;
};

const CRITICAL_TOPICS = new Set([
  'subscription_billing_attempts/success',
  'subscription_billing_attempts/failure',
]);

const HIGH_TOPICS = new Set([
  'subscription_contracts/create',
  'subscription_contracts/update',
  'orders/create',
  'orders/paid',
  'orders/updated',
  'orders/cancelled',
  'app/uninstalled',
]);

const MEDIUM_TOPICS = new Set([
  'customers/create',
  'customers/update',
  'customers/delete',
  'products/update',
  'inventory_levels/update',
  'subscription_billing_attempts/challenged',
  'app_subscriptions/update',
  'bulk_operations/finish',
  'customers/data_request',
  'customers/redact',
  'shop/redact',
]);

const LOW_TOPICS = new Set(['shop/update', 'fulfillments/update']);

export function queueForTopic(topic: string): string {
  if (CRITICAL_TOPICS.has(topic)) return WEBHOOK_QUEUES.critical;
  if (HIGH_TOPICS.has(topic)) return WEBHOOK_QUEUES.high;
  if (MEDIUM_TOPICS.has(topic)) return WEBHOOK_QUEUES.medium;
  if (LOW_TOPICS.has(topic)) return WEBHOOK_QUEUES.low;
  return WEBHOOK_QUEUES.high;
}

export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const;

/** Delay before GDPR shop data purge after uninstall. */
export const GDPR_CLEANUP_DELAY_MS = 48 * 60 * 60 * 1000;
