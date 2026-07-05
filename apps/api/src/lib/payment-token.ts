import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../env.js';

export function createPaymentUpdateToken(input: {
  contractId: string;
  shopId: string;
  customerId: string;
  expiresInHours?: number;
}): string {
  const expiresAt = Date.now() + (input.expiresInHours ?? 72) * 60 * 60 * 1000;
  const payload = Buffer.from(
    JSON.stringify({
      cid: input.contractId,
      sid: input.shopId,
      uid: input.customerId,
      exp: expiresAt,
      nonce: randomBytes(8).toString('hex'),
    }),
  ).toString('base64url');

  const sig = createHmac('sha256', env.JWT_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}.${sig}`;
}

export function verifyPaymentUpdateToken(token: string): {
  contractId: string;
  shopId: string;
  customerId: string;
} | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = createHmac('sha256', env.JWT_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig !== expected) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {
      cid: string;
      sid: string;
      uid: string;
      exp: number;
    };
    if (Date.now() > data.exp) return null;
    return {
      contractId: data.cid,
      shopId: data.sid,
      customerId: data.uid,
    };
  } catch {
    return null;
  }
}

export function paymentUpdateUrl(token: string): string {
  const base = env.SHOPIFY_APP_URL.replace(/\/$/, '');
  return `${base}/dunning/update-payment?token=${encodeURIComponent(token)}`;
}
