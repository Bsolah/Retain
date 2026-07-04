import { prisma, ShopStatus, type Shop } from '@retain/database';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type SessionTokenPayload = {
  shopId: string;
  shopifyDomain: string;
  shopifyShopId: string;
  sub: string;
  aud: string;
  iss: string;
};

export type AuthenticatedRequest = FastifyRequest & {
  shop?: Shop;
  session?: SessionTokenPayload;
};

const SESSION_TTL_SECONDS = 60 * 15;

export async function generateSessionToken(
  request: FastifyRequest,
  shop: Shop,
): Promise<string> {
  const payload: SessionTokenPayload = {
    shopId: shop.id,
    shopifyDomain: shop.shopifyDomain,
    shopifyShopId: shop.shopifyShopId,
    sub: shop.id,
    aud: 'retain-admin',
    iss: 'retain-api',
  };

  return request.server.jwt.sign(payload, {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/**
 * Verify App Bridge / embedded-admin session JWT and ensure the shop is active.
 */
export async function validateSessionToken(
  request: AuthenticatedRequest,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const payload = await request.jwtVerify<SessionTokenPayload>();

    if (!payload.shopId || payload.aud !== 'retain-admin') {
      await reply.status(401).send({
        message: 'Invalid session token',
        code: 'UNAUTHENTICATED',
        extensions: {},
      });
      return false;
    }

    const shop = await prisma.shop.findUnique({
      where: { id: payload.shopId },
    });

    if (!shop || shop.status !== ShopStatus.active) {
      await reply.status(401).send({
        message: 'Shop is not active',
        code: 'UNAUTHENTICATED',
        extensions: { status: shop?.status ?? 'missing' },
      });
      return false;
    }

    if (payload.shopifyDomain && payload.shopifyDomain !== shop.shopifyDomain) {
      await reply.status(401).send({
        message: 'Session shop mismatch',
        code: 'UNAUTHENTICATED',
        extensions: {},
      });
      return false;
    }

    request.shop = shop;
    request.session = payload;
    return true;
  } catch {
    await reply.status(401).send({
      message: 'Invalid or expired session token',
      code: 'UNAUTHENTICATED',
      extensions: {},
    });
    return false;
  }
}

export function createSessionPreHandler() {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const ok = await validateSessionToken(request, reply);
    if (!ok) {
      return reply;
    }
  };
}
