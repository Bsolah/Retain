import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@retain/database';
import {
  buildCancelOffer,
  resolveCancelFlow,
  startCancelFlow,
  type CancelReason,
} from '../services/cancel-flow.js';
import { readPortalTokens } from './portal-auth.js';
import { discoverCustomerAccountApi } from '../services/customer-account.js';

async function resolveContractFromPortal(
  request: FastifyRequest,
  reply: FastifyReply,
  contractId: string,
): Promise<string | null> {
  const { shopDomain } = readPortalTokens(request);
  if (!shopDomain) {
    await reply
      .status(401)
      .send({ message: 'Not authenticated', code: 'UNAUTHENTICATED' });
    return null;
  }

  void discoverCustomerAccountApi(shopDomain);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
  });
  if (!shop) {
    await reply.status(404).send({ message: 'Shop not found' });
    return null;
  }

  const contract = await prisma.subscriptionContract.findFirst({
    where: {
      shopId: shop.id,
      OR: [{ id: contractId }, { shopifyContractId: contractId }],
    },
  });

  if (!contract) {
    await reply.status(404).send({ message: 'Subscription not found' });
    return null;
  }

  return contract.id;
}

export async function registerCancelFlowRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post<{ Body: { contractId: string } }>(
    '/cancel-flow/start',
    async (request, reply) => {
      const contractId = request.body?.contractId;
      if (!contractId) {
        return reply.status(400).send({ message: 'contractId required' });
      }

      const localId = await resolveContractFromPortal(
        request,
        reply,
        contractId,
      );
      if (!localId) return;

      const result = await startCancelFlow(localId);
      return reply.send(result);
    },
  );

  app.post<{ Body: { contractId: string; reason: CancelReason } }>(
    '/cancel-flow/offer',
    async (request, reply) => {
      const { contractId, reason } = request.body ?? {};
      if (!contractId || !reason) {
        return reply
          .status(400)
          .send({ message: 'contractId and reason required' });
      }

      const localId = await resolveContractFromPortal(
        request,
        reply,
        contractId,
      );
      if (!localId) return;

      const result = await buildCancelOffer(localId, reason);
      return reply.send(result);
    },
  );

  app.post<{
    Body: {
      contractId: string;
      action: 'accept' | 'cancel';
      interventionId?: string;
      reason?: CancelReason;
      feedback?: string;
    };
  }>('/cancel-flow/resolve', async (request, reply) => {
    const { contractId, action, interventionId, reason, feedback } =
      request.body ?? {};
    if (!contractId || !action) {
      return reply
        .status(400)
        .send({ message: 'contractId and action required' });
    }

    const localId = await resolveContractFromPortal(request, reply, contractId);
    if (!localId) return;

    const result = await resolveCancelFlow({
      contractId: localId,
      action,
      interventionId,
      reason,
      feedback,
    });
    return reply.send(result);
  });
}
