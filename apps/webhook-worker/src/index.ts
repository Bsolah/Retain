import Fastify from 'fastify';
import { createHealthResponse } from '@retain/shared';
import { env } from './env.js';
import { registry } from './lib/metrics.js';
import { connectRedis, disconnectRedis, getRedis } from './lib/redis.js';
import {
  refreshQueueMetrics,
  shutdownWorkers,
  startWorkers,
} from './workers/start.js';

const app = Fastify({ logger: true });

app.get('/health', async (_request, reply) => {
  try {
    await getRedis().ping();
    return reply.status(200).send(createHealthResponse('webhook-worker'));
  } catch {
    return reply.status(503).send({ status: 'degraded' });
  }
});

app.get('/metrics', async (_request, reply) => {
  await refreshQueueMetrics();
  reply.header('content-type', registry.contentType);
  return reply.send(await registry.metrics());
});

try {
  await connectRedis();
  startWorkers();

  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`Webhook worker listening on ${env.HOST}:${env.PORT}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to start webhook worker:', message);
  console.error(error);
  process.exit(1);
}

async function shutdown() {
  await shutdownWorkers();
  await disconnectRedis();
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

setInterval(() => {
  void refreshQueueMetrics().catch((error) => {
    console.error('Failed to refresh queue metrics', error);
  });
}, 15_000);
