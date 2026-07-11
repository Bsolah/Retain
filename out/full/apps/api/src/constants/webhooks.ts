/**
 * Required Shopify webhook topics for Retain.
 * `rest` is used in callback URLs and inbound routing.
 * `graphql` is the Admin API enum for webhookSubscriptionCreate.
 */
export const REQUIRED_WEBHOOK_TOPICS = [
  { rest: 'app/uninstalled', graphql: 'APP_UNINSTALLED' },
  { rest: 'app_subscriptions/update', graphql: 'APP_SUBSCRIPTIONS_UPDATE' },
  { rest: 'bulk_operations/finish', graphql: 'BULK_OPERATIONS_FINISH' },
  { rest: 'customers/create', graphql: 'CUSTOMERS_CREATE' },
  { rest: 'customers/update', graphql: 'CUSTOMERS_UPDATE' },
  { rest: 'customers/delete', graphql: 'CUSTOMERS_DELETE' },
  { rest: 'customers/data_request', graphql: 'CUSTOMERS_DATA_REQUEST' },
  { rest: 'customers/redact', graphql: 'CUSTOMERS_REDACT' },
  { rest: 'shop/redact', graphql: 'SHOP_REDACT' },
  { rest: 'orders/create', graphql: 'ORDERS_CREATE' },
  { rest: 'orders/updated', graphql: 'ORDERS_UPDATED' },
  { rest: 'orders/paid', graphql: 'ORDERS_PAID' },
  { rest: 'orders/cancelled', graphql: 'ORDERS_CANCELLED' },
  {
    rest: 'subscription_contracts/create',
    graphql: 'SUBSCRIPTION_CONTRACTS_CREATE',
  },
  {
    rest: 'subscription_contracts/update',
    graphql: 'SUBSCRIPTION_CONTRACTS_UPDATE',
  },
  {
    rest: 'subscription_billing_attempts/success',
    graphql: 'SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS',
  },
  {
    rest: 'subscription_billing_attempts/failure',
    graphql: 'SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE',
  },
  {
    rest: 'subscription_billing_attempts/challenged',
    graphql: 'SUBSCRIPTION_BILLING_ATTEMPTS_CHALLENGED',
  },
  { rest: 'products/update', graphql: 'PRODUCTS_UPDATE' },
] as const;

export type WebhookTopicRest = (typeof REQUIRED_WEBHOOK_TOPICS)[number]['rest'];

export type WebhookTopicGraphql =
  (typeof REQUIRED_WEBHOOK_TOPICS)[number]['graphql'];

export const WEBHOOK_TOPIC_COUNT = REQUIRED_WEBHOOK_TOPICS.length;

export const GDPR_CLEANUP_DELAY_MS = 48 * 60 * 60 * 1000;

export function isKnownWebhookTopic(topic: string): topic is WebhookTopicRest {
  return REQUIRED_WEBHOOK_TOPICS.some((entry) => entry.rest === topic);
}
