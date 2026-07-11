import type { FastifyInstance } from 'fastify';
import { prisma } from '@retain/database';
import { verifyPaymentUpdateToken } from '../lib/payment-token.js';
import { env } from '../env.js';
import {
  getDunningRecoveryStats,
  getPortalBanner,
} from '../services/dunning.js';
import {
  createSessionPreHandler,
  type AuthenticatedRequest,
} from '../middleware/session.js';

export async function registerDunningRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get<{ Querystring: { token?: string } }>(
    '/dunning/update-payment',
    async (request, reply) => {
      const token = request.query.token;
      if (!token) {
        return reply.status(400).send({ message: 'token required' });
      }

      const decoded = verifyPaymentUpdateToken(token);
      if (!decoded) {
        return reply.status(401).send({ message: 'Invalid or expired token' });
      }

      const contract = await prisma.subscriptionContract.findFirst({
        where: { id: decoded.contractId, shopId: decoded.shopId },
        include: { shop: true },
      });

      if (!contract) {
        return reply.status(404).send({ message: 'Subscription not found' });
      }

      const portalUrl = `${env.PORTAL_URL.replace(/\/$/, '')}/portal/${contract.id}?payment=update`;

      return reply.redirect(portalUrl);
    },
  );

  app.get<{ Params: { contractId: string } }>(
    '/portal/api/subscriptions/:contractId/banner',
    async (request, reply) => {
      const banner = await getPortalBanner(request.params.contractId);
      return reply.send({ banner });
    },
  );

  const auth = createSessionPreHandler();
  app.get(
    '/admin/dunning/recovery-stats',
    { preHandler: auth },
    async (request) => {
      const req = request as AuthenticatedRequest;
      return getDunningRecoveryStats(req.shop!.id);
    },
  );
}
