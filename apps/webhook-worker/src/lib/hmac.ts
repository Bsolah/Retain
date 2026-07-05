import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

export function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | undefined,
): boolean {
  if (!hmacHeader) return false;

  const digest = createHmac('sha256', env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  const left = Buffer.from(digest);
  const right = Buffer.from(hmacHeader);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
