import {
  prisma,
  type Customer,
  type PrismaClient,
  type Shop,
} from '@retain/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { getRedis } from './lib/redis.js';

export type MerchantIdentity = {
  shopId: string;
  shopifyDomain?: string;
  shopifyShopId?: string;
};

export type CustomerIdentity = {
  customerId: string;
  shopifyCustomerId?: string;
  email?: string;
};

export type GraphQLContext = {
  request: FastifyRequest;
  reply: FastifyReply;
  prisma: PrismaClient;
  redis: Redis;
  shop: Shop | null;
  customer: Customer | null;
  merchant: MerchantIdentity | null;
  customerIdentity: CustomerIdentity | null;
};

type JwtMerchantPayload = {
  shopId?: string;
  shopifyDomain?: string;
  shopifyShopId?: string;
  sub?: string;
};

type CustomerAccountClaims = {
  sub?: string;
  email?: string;
  customerId?: string;
  shopifyCustomerId?: string;
  dest?: string;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseToken(header?: string): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) {
    return token;
  }

  // Customer Account API tokens may be sent as a raw JWT.
  if (header.split('.').length === 3) {
    return header;
  }

  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveMerchant(
  request: FastifyRequest,
): Promise<{ merchant: MerchantIdentity | null; shop: Shop | null }> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return { merchant: null, shop: null };
  }

  try {
    const payload = await request.jwtVerify<JwtMerchantPayload>();
    const shopId = payload.shopId ?? payload.sub;

    if (!shopId) {
      return { merchant: null, shop: null };
    }

    const merchant: MerchantIdentity = {
      shopId,
      shopifyDomain: payload.shopifyDomain,
      shopifyShopId: payload.shopifyShopId,
    };

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    return { merchant, shop };
  } catch {
    return { merchant: null, shop: null };
  }
}

async function resolveCustomer(
  request: FastifyRequest,
  shop: Shop | null,
): Promise<{
  customerIdentity: CustomerIdentity | null;
  customer: Customer | null;
}> {
  const token =
    parseToken(headerValue(request.headers['x-customer-token'])) ??
    parseToken(headerValue(request.headers['x-shopify-customer-access-token']));

  if (!token) {
    return { customerIdentity: null, customer: null };
  }

  const claims = decodeJwtPayload(token) as CustomerAccountClaims | null;
  if (!claims) {
    return { customerIdentity: null, customer: null };
  }

  const shopifyCustomerId =
    claims.shopifyCustomerId ??
    (typeof claims.sub === 'string' && claims.sub.includes('Customer')
      ? claims.sub
      : undefined);
  const customerId = claims.customerId;

  const customerIdentity: CustomerIdentity = {
    customerId: customerId ?? shopifyCustomerId ?? 'unknown',
    shopifyCustomerId,
    email: claims.email,
  };

  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    return { customerIdentity, customer };
  }

  if (shop && shopifyCustomerId) {
    const customer = await prisma.customer.findUnique({
      where: {
        shopId_shopifyCustomerId: {
          shopId: shop.id,
          shopifyCustomerId,
        },
      },
    });
    return { customerIdentity, customer };
  }

  return { customerIdentity, customer: null };
}

export async function buildContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<GraphQLContext> {
  const redis = getRedis();
  const { merchant, shop } = await resolveMerchant(request);
  const { customerIdentity, customer } = await resolveCustomer(request, shop);

  return {
    request,
    reply,
    prisma,
    redis,
    shop,
    customer,
    merchant,
    customerIdentity,
  };
}
