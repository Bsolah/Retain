import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

let cachedApp: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (!cachedApp) {
    cachedApp = await buildServer();
    await cachedApp.ready();
  }
  return cachedApp;
}

export async function closeTestApp(): Promise<void> {
  if (cachedApp) {
    await cachedApp.close();
    cachedApp = null;
  }
}

export function createSessionToken(
  app: FastifyInstance,
  payload: {
    shopId: string;
    shopifyDomain: string;
    shopifyShopId: string;
  },
): string {
  return app.jwt.sign({
    ...payload,
    sub: payload.shopId,
    aud: 'retain-admin',
    iss: 'retain-api',
  });
}
