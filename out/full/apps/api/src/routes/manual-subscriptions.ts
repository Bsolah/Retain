import type { FastifyInstance } from 'fastify';
import {
  createSessionPreHandler,
  type AuthenticatedRequest,
} from '../middleware/session.js';
import {
  createManualSubscription,
  lookupCustomerForManualSubscription,
  parseManualSubscriptionInput,
} from '../services/manual-subscription.js';

export async function registerManualSubscriptionRoutes(
  app: FastifyInstance,
): Promise<void> {
  const auth = createSessionPreHandler();

  app.get(
    '/admin/manual-subscriptions/customer-lookup',
    { preHandler: auth },
    async (request) => {
      const req = request as AuthenticatedRequest;
      const query = request.query as { email?: string };
      if (!query.email?.trim()) {
        return { found: false, customer: null, paymentMethods: [] };
      }

      return lookupCustomerForManualSubscription(req.shop!, query.email.trim());
    },
  );

  app.post(
    '/admin/manual-subscriptions',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;

      try {
        const parsed = parseManualSubscriptionInput(request.body);
        const result = await createManualSubscription(req.shop!, parsed);
        return reply.status(201).send(result);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to create subscription';
        const status = /required|invalid|incomplete/i.test(message) ? 400 : 422;
        return reply.status(status).send({ message });
      }
    },
  );
}
