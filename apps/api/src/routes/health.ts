import { prisma } from '@retain/database';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { getRedis } from '../lib/redis.js';
import { version } from '../version.js';

export async function registerHealthRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      version,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/db', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.status(200).send({
        status: 'ok',
        service: 'postgresql',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      requestError(app, 'db health check failed', error);
      return reply.status(503).send({
        status: 'error',
        service: 'postgresql',
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get('/health/redis', async (_request, reply) => {
    try {
      const redis = getRedis();
      const pong = await redis.ping();

      if (pong !== 'PONG') {
        throw new Error(`Unexpected Redis ping response: ${pong}`);
      }

      return reply.status(200).send({
        status: 'ok',
        service: 'redis',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      requestError(app, 'redis health check failed', error);
      return reply.status(503).send({
        status: 'error',
        service: 'redis',
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get('/health/ai', async (_request, reply) => {
    try {
      const response = await fetch(new URL('/health', env.AI_SERVICE_URL), {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        throw new Error(`AI service responded with ${response.status}`);
      }

      return reply.status(200).send({
        status: 'ok',
        service: 'ai',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      requestError(app, 'ai health check failed', error);
      return reply.status(503).send({
        status: 'error',
        service: 'ai',
        timestamp: new Date().toISOString(),
      });
    }
  });
}

function requestError(
  app: FastifyInstance,
  message: string,
  error: unknown,
): void {
  app.log.error({ err: error }, message);
}
