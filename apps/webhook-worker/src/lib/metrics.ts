import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const processedTotal = new Counter({
  name: 'webhook_processed_total',
  help: 'Total webhooks processed',
  labelNames: ['topic', 'queue', 'status'] as const,
  registers: [registry],
});

export const processingDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Webhook processing duration',
  labelNames: ['topic', 'queue'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: 'webhook_queue_depth',
  help: 'Jobs waiting in queue',
  labelNames: ['queue'] as const,
  registers: [registry],
});

export const dlqTotal = new Counter({
  name: 'webhook_dlq_total',
  help: 'Jobs moved to dead letter queue',
  labelNames: ['topic', 'queue'] as const,
  registers: [registry],
});
