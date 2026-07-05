import type { ShopifyWebhookJob } from '@retain/shared';
import { verifyWebhookHmac } from './hmac.js';
import { isWebhookProcessed, markWebhookProcessed } from './idempotency.js';
import {
  handleAppUninstalled,
  handleBillingFailure,
  handleBillingSuccess,
  handleContractCreate,
  handleContractUpdate,
  handleCustomerWebhook,
  handleFulfillmentUpdate,
  handleGeneric,
  handleInventoryUpdate,
  handleOrderWebhook,
  handleProductUpdate,
  handleShopUpdate,
} from '../handlers/index.js';

const TOPIC_HANDLERS: Record<
  string,
  (job: ShopifyWebhookJob) => Promise<unknown>
> = {
  'subscription_contracts/create': handleContractCreate,
  'subscription_contracts/update': handleContractUpdate,
  'subscription_billing_attempts/success': handleBillingSuccess,
  'subscription_billing_attempts/failure': handleBillingFailure,
  'orders/create': handleOrderWebhook,
  'orders/paid': handleOrderWebhook,
  'orders/updated': handleOrderWebhook,
  'orders/cancelled': handleOrderWebhook,
  'customers/create': handleCustomerWebhook,
  'customers/update': handleCustomerWebhook,
  'customers/delete': handleCustomerWebhook,
  'products/update': handleProductUpdate,
  'shop/update': handleShopUpdate,
  'fulfillments/update': handleFulfillmentUpdate,
  'inventory_levels/update': handleInventoryUpdate,
  'app/uninstalled': handleAppUninstalled,
};

export async function processWebhookJob(
  job: ShopifyWebhookJob,
): Promise<unknown> {
  if (job.rawBody && job.hmac && !verifyWebhookHmac(job.rawBody, job.hmac)) {
    throw new Error('Webhook HMAC verification failed in worker');
  }

  if (await isWebhookProcessed(job.webhookId)) {
    return { duplicate: true, webhookId: job.webhookId };
  }

  const handler = TOPIC_HANDLERS[job.topic] ?? handleGeneric;
  const result = await handler(job);
  await markWebhookProcessed(job.webhookId);
  return result;
}
