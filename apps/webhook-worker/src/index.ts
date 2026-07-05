import Fastify from 'fastify';
import { createHealthResponse } from '@retain/shared';
import { env } from './env.js';
import { registry } from './lib/metrics.js';
import { disconnectRedis, getRedis } from './lib/redis.js';
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

startWorkers();

setInterval(() => {
  void refreshQueueMetrics().catch((error) => {
    console.error('Failed to refresh queue metrics', error);
  });
}, 15_000);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`Webhook worker listening on ${env.HOST}:${env.PORT}`);
} catch (error) {
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
