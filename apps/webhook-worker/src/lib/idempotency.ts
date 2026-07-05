import { getRedis } from './redis.js';

const TTL_SECONDS = 60 * 60 * 24;

export async function isWebhookProcessed(webhookId: string): Promise<boolean> {
  const redis = getRedis();
  const exists = await redis.exists(`webhook:${webhookId}`);
  return exists === 1;
}

export async function markWebhookProcessed(webhookId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(`webhook:${webhookId}`, '1', 'EX', TTL_SECONDS);
}
