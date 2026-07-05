import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { prisma } from '@retain/database';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import mercurius from 'mercurius';
import { env } from './env.js';
import { connectRedis, disconnectRedis, getRedis } from './lib/redis.js';
import { drainQueues } from './lib/shutdown.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerCancelFlowRoutes } from './routes/cancel-flow.js';
import { registerDunningRoutes } from './routes/dunning.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPortalApiRoutes } from './routes/portal-api.js';
import { registerPortalAuthRoutes } from './routes/portal-auth.js';
import { registerMigrationRoutes } from './routes/migrations.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerSendGridWebhookRoutes } from './routes/sendgrid-webhooks.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { mercuriusConfig, registerQueryComplexityHook } from './schema.js';
import {
  startBillingScheduler,
  stopBillingScheduler,
} from './services/billing-scheduler.js';
import {
  startDunningScheduler,
  stopDunningScheduler,
} from './workers/dunning-scheduler.js';
import {
  startMigrationWorkers,
  stopMigrationWorkers,
} from './workers/migration-worker.js';
import { startWebhookProcessor } from './workers/webhook-processor.js';

const SHOPIFY_ADMIN_ORIGINS = [
  /^https:\/\/admin\.shopify\.com$/,
  /^https:\/\/[^/]+\.myshopify\.com$/,
  /^https:\/\/[^/]+\.shopify\.com$/,
];

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // Structured JSON logs (Pino default serializer).
      base: {
        service: 'api',
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            remoteAddress: request.ip,
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
    trustProxy: true,
  });

  await connectRedis();
  const redis = getRedis();

  // Allow embedding in Shopify Admin (default helmet frameguard blocks iframes).
  await app.register(helmet, {
    contentSecurityPolicy:
      env.NODE_ENV === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              frameAncestors: [
                'https://admin.shopify.com',
                'https://*.myshopify.com',
                'https://admin.shopify.com',
              ],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const portalOrigin = env.PORTAL_URL.replace(/\/$/, '');
      const allowed =
        origin === portalOrigin ||
        SHOPIFY_ADMIN_ORIGINS.some((pattern) => pattern.test(origin));

      if (allowed || env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    redis,
    nameSpace: 'retain-api-rate:',
    allowList: (request) =>
      request.url.startsWith('/health') ||
      request.url.startsWith('/auth/') ||
      request.url.startsWith('/portal/') ||
      request.url.startsWith('/cancel-flow/') ||
      request.url.startsWith('/dunning/') ||
      request.url.startsWith('/migrations/') ||
      request.url.startsWith('/webhooks/'),
    keyGenerator: (request) => shopRateLimitKey(request),
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded for this shop. Retry in ${context.after}`,
    }),
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerPortalAuthRoutes(app);
  await registerPortalApiRoutes(app);
  await registerCancelFlowRoutes(app);
  await registerDunningRoutes(app);
  await registerMigrationRoutes(app);
  await registerNotificationRoutes(app);
  await registerSendGridWebhookRoutes(app);
  await registerWebhookRoutes(app);

  await app.register(mercurius, mercuriusConfig);
  await registerQueryComplexityHook(app);

  if (env.PROCESS_WEBHOOKS_IN_API && !env.SKIP_BACKGROUND_WORKERS) {
    startWebhookProcessor();
  }
  if (!env.SKIP_BACKGROUND_WORKERS) {
    startBillingScheduler();
    startDunningScheduler();
    startMigrationWorkers();
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled request error');

    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    return reply.status(statusCode).send({
      message: error.message || 'Internal Server Error',
      code:
        'code' in error && typeof error.code === 'string'
          ? error.code
          : 'INTERNAL_SERVER_ERROR',
      extensions: {
        statusCode,
      },
    });
  });

  registerGracefulShutdown(app);

  return app;
}

function shopRateLimitKey(request: FastifyRequest): string {
  const shopHeader = headerValue(request.headers['x-shop-id']);
  if (shopHeader) {
    return `shop:${shopHeader}`;
  }

  const bearer = headerValue(request.headers.authorization);
  const token = bearer?.replace(/^Bearer\s+/i, '');

  if (token) {
    try {
      const decoded = request.server.jwt.decode<{
        shopId?: string;
        sub?: string;
      }>(token);

      const shopId =
        decoded && typeof decoded === 'object'
          ? (decoded.shopId ?? decoded.sub)
          : undefined;

      if (shopId) {
        return `shop:${shopId}`;
      }
    } catch {
      // Fall through to IP-based limiting for anonymous traffic.
    }
  }

  return `ip:${request.ip}`;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function registerGracefulShutdown(app: FastifyInstance): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, 'Graceful shutdown started');

    try {
      stopBillingScheduler();
      stopDunningScheduler();
      await stopMigrationWorkers();
      await app.close();
      await drainQueues();
      await prisma.$disconnect();
      await disconnectRedis();
      app.log.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Graceful shutdown failed');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

export async function startServer(): Promise<FastifyInstance> {
  const app = await buildServer();

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  app.log.info(
    {
      port: env.PORT,
      host: env.HOST,
      env: env.NODE_ENV,
    },
    'Retain API listening',
  );

  return app;
}
