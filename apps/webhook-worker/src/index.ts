import { Queue, Worker } from 'bullmq';
import Fastify from 'fastify';
import { createHealthResponse } from '@retain/shared';

const PORT = Number(process.env.PORT ?? 3002);
const HOST = process.env.HOST ?? '0.0.0.0';

function getRedisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

const connection = getRedisConnection();
const webhookQueue = new Queue('webhooks', { connection });

const worker = new Worker(
  'webhooks',
  async (job) => {
    // Scaffold only — webhook handlers will be implemented later.
    return { received: job.name, id: job.id };
  },
  { connection },
);

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id ?? 'unknown'} failed:`, error.message);
});

const app = Fastify({
  logger: true,
});

app.get('/health', async (_request, reply) => {
  return reply.status(200).send(createHealthResponse('webhook-worker'));
});

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Webhook worker listening on ${HOST}:${PORT}`);
  console.log(`Queue ready: ${webhookQueue.name}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}

async function shutdown() {
  await worker.close();
  await webhookQueue.close();
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
