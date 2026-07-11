import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  processSendGridEvent,
  type SendGridEvent,
} from '../services/notifications.js';

function parseSendGridPayload(body: unknown): SendGridEvent[] {
  if (Array.isArray(body)) {
    return body as SendGridEvent[];
  }
  if (body && typeof body === 'object') {
    return [body as SendGridEvent];
  }
  return [];
}

async function handleSendGridWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  eventType: string,
): Promise<void> {
  const events = parseSendGridPayload(request.body);
  const result = await processSendGridEvent(eventType, events);
  await reply.status(200).send({ ok: true, processed: result.processed });
}

export async function registerSendGridWebhookRoutes(
  app: FastifyInstance,
): Promise<void> {
  const routes: Array<{ path: string; event: string }> = [
    { path: '/webhooks/sendgrid/delivered', event: 'delivered' },
    { path: '/webhooks/sendgrid/opened', event: 'open' },
    { path: '/webhooks/sendgrid/clicked', event: 'click' },
    { path: '/webhooks/sendgrid/bounced', event: 'bounce' },
    { path: '/webhooks/sendgrid/complained', event: 'spamreport' },
  ];

  for (const route of routes) {
    app.post(route.path, async (request, reply) => {
      await handleSendGridWebhook(request, reply, route.event);
    });
  }
}
