import type { FastifyInstance } from 'fastify';
import {
  createSessionPreHandler,
  type AuthenticatedRequest,
} from '../middleware/session.js';
import {
  getMerchantSupportContext,
  getSupportConfig,
  isSupportCategory,
  submitMerchantSupportRequest,
} from '../services/merchant-support.js';

export async function registerSupportRoutes(
  app: FastifyInstance,
): Promise<void> {
  const auth = createSessionPreHandler();

  app.get('/admin/support/context', { preHandler: auth }, async (request) => {
    const req = request as AuthenticatedRequest;
    return getMerchantSupportContext(req.shop!);
  });

  app.get('/admin/support/config', { preHandler: auth }, async () => {
    return getSupportConfig();
  });

  app.post(
    '/admin/support/contact',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const body = request.body as {
        category?: string;
        message?: string;
        replyEmail?: string;
        subject?: string;
        pageUrl?: string;
      };

      if (!body.category || !isSupportCategory(body.category)) {
        return reply.status(400).send({ message: 'Invalid support category' });
      }

      if (!body.message?.trim()) {
        return reply.status(400).send({ message: 'Message is required' });
      }

      if (!body.replyEmail?.trim()) {
        return reply.status(400).send({ message: 'Reply email is required' });
      }

      try {
        const result = await submitMerchantSupportRequest(req.shop!, {
          category: body.category,
          message: body.message,
          replyEmail: body.replyEmail,
          subject: body.subject,
          pageUrl: body.pageUrl,
        });
        return result;
      } catch (error) {
        return reply.status(400).send({
          message:
            error instanceof Error ? error.message : 'Unable to send message',
        });
      }
    },
  );
}
