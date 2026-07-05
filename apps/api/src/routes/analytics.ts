import { EventSource, prisma } from '@retain/database';
import type { FastifyInstance } from 'fastify';
import {
  createSessionPreHandler,
  type AuthenticatedRequest,
} from '../middleware/session.js';
import {
  getAiPerformance,
  getCohortAnalysis,
  getDashboardOverview,
  getSubscriberDetail,
  listSubscribers,
  resolveRange,
  type DateRangeKey,
} from '../services/analytics.js';
import {
  cancelContract,
  pauseContract,
  resumeContract,
} from '../services/contract-manager.js';
import { logEvent } from '../services/events.js';

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
): Promise<void> {
  const auth = createSessionPreHandler();

  app.get(
    '/admin/analytics/overview',
    { preHandler: auth },
    async (request) => {
      const req = request as AuthenticatedRequest;
      const query = request.query as {
        range?: DateRangeKey;
        start?: string;
        end?: string;
        growthDays?: string;
      };
      const range = resolveRange(query.range ?? '30d', query.start, query.end);
      const growthDays = Number(query.growthDays ?? 30) as 30 | 90 | 365;
      return getDashboardOverview(req.shop!.id, range, growthDays);
    },
  );

  app.get('/admin/analytics/cohorts', { preHandler: auth }, async (request) => {
    const req = request as AuthenticatedRequest;
    const query = request.query as Record<string, string | undefined>;
    return getCohortAnalysis(req.shop!.id, {
      channel: query.channel,
      product: query.product,
      geography: query.geography,
      discount: query.discount,
    });
  });

  app.get(
    '/admin/analytics/subscribers',
    { preHandler: auth },
    async (request) => {
      const req = request as AuthenticatedRequest;
      const query = request.query as Record<string, string | undefined>;
      return listSubscribers(req.shop!.id, {
        search: query.search,
        statuses: query.statuses?.split(',').filter(Boolean),
        riskLevels: query.riskLevels?.split(',').filter(Boolean),
        planId: query.planId,
        frequency: query.frequency,
        nextChargeFrom: query.nextChargeFrom,
        nextChargeTo: query.nextChargeTo,
        limit: query.limit ? Number(query.limit) : 50,
        offset: query.offset ? Number(query.offset) : 0,
      });
    },
  );

  app.get<{ Params: { contractId: string } }>(
    '/admin/analytics/subscribers/:contractId',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const detail = await getSubscriberDetail(
        req.shop!.id,
        request.params.contractId,
      );
      if (!detail) {
        return reply.status(404).send({ message: 'Subscriber not found' });
      }
      return detail;
    },
  );

  app.post<{
    Body: {
      contractIds: string[];
      action: string;
      durationDays?: number;
      reason?: string;
      tag?: string;
    };
  }>(
    '/admin/analytics/subscribers/bulk',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const { contractIds, action, durationDays, reason, tag } =
        request.body ?? {};
      if (!Array.isArray(contractIds) || contractIds.length === 0) {
        return reply.status(400).send({ message: 'contractIds required' });
      }

      const results: Array<{ id: string; ok: boolean; error?: string }> = [];

      for (const id of contractIds) {
        try {
          const owned = await prisma.subscriptionContract.findFirst({
            where: { id, shopId: req.shop!.id },
          });
          if (!owned) {
            results.push({ id, ok: false, error: 'not found' });
            continue;
          }

          if (action === 'pause') {
            await pauseContract({
              id,
              durationDays: durationDays ?? 30,
              actor: 'merchant',
            });
          } else if (action === 'resume') {
            await resumeContract({ id, actor: 'merchant' });
          } else if (action === 'cancel') {
            await cancelContract({
              id,
              reason: reason ?? 'merchant_bulk_cancel',
              actor: 'merchant',
            });
          } else if (action === 'tag' && tag) {
            await logEvent({
              shopId: req.shop!.id,
              contractId: id,
              eventType: 'merchant.tag',
              payload: { tag },
              source: EventSource.merchant,
            });
          } else {
            results.push({ id, ok: false, error: 'unknown action' });
            continue;
          }
          results.push({ id, ok: true });
        } catch (error) {
          results.push({
            id,
            ok: false,
            error: error instanceof Error ? error.message : 'failed',
          });
        }
      }

      return { results };
    },
  );

  app.post<{
    Params: { contractId: string };
    Body: { note: string };
  }>(
    '/admin/analytics/subscribers/:contractId/notes',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const note = request.body?.note?.trim();
      if (!note) {
        return reply.status(400).send({ message: 'note required' });
      }
      const contract = await prisma.subscriptionContract.findFirst({
        where: { id: request.params.contractId, shopId: req.shop!.id },
      });
      if (!contract) {
        return reply.status(404).send({ message: 'Subscriber not found' });
      }
      await logEvent({
        shopId: req.shop!.id,
        contractId: contract.id,
        eventType: 'merchant.note',
        payload: { note },
        source: EventSource.merchant,
      });
      return { ok: true };
    },
  );

  app.post<{
    Params: { contractId: string };
    Body: {
      interventionType: string;
      subject?: string;
      body?: string;
      offerValue?: Record<string, unknown>;
    };
  }>(
    '/admin/analytics/subscribers/:contractId/interventions',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const contract = await prisma.subscriptionContract.findFirst({
        where: { id: request.params.contractId, shopId: req.shop!.id },
      });
      if (!contract) {
        return reply.status(404).send({ message: 'Subscriber not found' });
      }

      const intervention = await prisma.intervention.create({
        data: {
          shopId: req.shop!.id,
          contractId: contract.id,
          interventionType: request.body.interventionType as never,
          triggerReason: 'merchant_manual',
          messageSubject: request.body.subject ?? 'Custom offer',
          messageBody: request.body.body ?? '',
          offerValue: (request.body.offerValue ?? {}) as object,
          status: 'pending',
          isAuto: false,
          createdBy: 'merchant',
        },
      });

      return intervention;
    },
  );

  app.get('/admin/analytics/ai', { preHandler: auth }, async (request) => {
    const req = request as AuthenticatedRequest;
    return getAiPerformance(req.shop!.id);
  });
}
