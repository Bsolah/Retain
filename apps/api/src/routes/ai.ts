import { ContractStatus, prisma } from '@retain/database';
import type { FastifyInstance } from 'fastify';
import {
  AiServiceError,
  batchPredict,
  deployModel,
  evaluateInterventionsBatch,
  generateShopFeatures,
  getAiFeaturesHealth,
  getAiLiveness,
  getAiPipelineLastRun,
  runShopPipeline,
  trainModel,
} from '../lib/ai-client.js';
import {
  createSessionPreHandler,
  type AuthenticatedRequest,
} from '../middleware/session.js';

const ACTIVE_FOR_SCORING: ContractStatus[] = [
  ContractStatus.active,
  ContractStatus.paused,
  ContractStatus.payment_failed,
];

function aiErrorReply(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof AiServiceError) {
    return reply.status(error.statusCode >= 400 ? error.statusCode : 502).send({
      message: error.message,
      code: 'AI_SERVICE_ERROR',
      details: error.details,
    });
  }
  const message = error instanceof Error ? error.message : 'AI request failed';
  return reply.status(500).send({ message, code: 'AI_REQUEST_FAILED' });
}

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  const auth = createSessionPreHandler();

  app.get('/admin/ai/status', { preHandler: auth }, async (request) => {
    const req = request as AuthenticatedRequest;
    const shopId = req.shop!.id;

    let liveness: Awaited<ReturnType<typeof getAiLiveness>> | null = null;
    let featuresHealth: Awaited<ReturnType<typeof getAiFeaturesHealth>> | null =
      null;
    let livenessError: string | null = null;
    let featuresError: string | null = null;

    try {
      liveness = await getAiLiveness();
    } catch (error) {
      livenessError =
        error instanceof Error ? error.message : 'AI liveness check failed';
    }

    try {
      featuresHealth = await getAiFeaturesHealth();
    } catch (error) {
      featuresError =
        error instanceof Error ? error.message : 'AI features health failed';
    }

    const lastPipelineRun = await getAiPipelineLastRun();

    const activeModel = await prisma.modelRegistry.findFirst({
      where: {
        isActive: true,
        OR: [{ shopId }, { shopId: null }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const settings = (req.shop!.settings ?? {}) as {
      auto_interventions_enabled?: boolean;
    };

    const status =
      liveness?.status === 'ok'
        ? featuresHealth?.status === 'ok'
          ? 'ok'
          : 'degraded'
        : 'down';

    return {
      status,
      ai: {
        liveness,
        livenessError,
        featuresHealth,
        featuresError,
      },
      lastPipelineRun,
      activeModel: activeModel
        ? {
            version: activeModel.version,
            metrics: activeModel.metrics,
            rolloutPercentage: activeModel.rolloutPercentage,
            createdAt: activeModel.createdAt.toISOString(),
          }
        : null,
      settings: {
        autoInterventionsEnabled: settings.auto_interventions_enabled !== false,
      },
    };
  });

  app.put(
    '/admin/ai/settings',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const body = (request.body ?? {}) as {
        autoInterventionsEnabled?: boolean;
      };

      if (typeof body.autoInterventionsEnabled !== 'boolean') {
        return reply.status(400).send({
          message: 'autoInterventionsEnabled boolean is required',
        });
      }

      const current = (req.shop!.settings ?? {}) as Record<string, unknown>;
      const updated = await prisma.shop.update({
        where: { id: req.shop!.id },
        data: {
          settings: {
            ...current,
            auto_interventions_enabled: body.autoInterventionsEnabled,
          },
        },
      });

      const settings = updated.settings as {
        auto_interventions_enabled?: boolean;
      };

      return {
        autoInterventionsEnabled: settings.auto_interventions_enabled !== false,
      };
    },
  );

  app.post(
    '/admin/ai/features/refresh',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      try {
        return await generateShopFeatures(req.shop!.id);
      } catch (error) {
        return aiErrorReply(reply, error);
      }
    },
  );

  app.post(
    '/admin/ai/models/train',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const body = (request.body ?? {}) as {
        retrainAll?: boolean;
        deploy?: boolean;
        rolloutPercentage?: number;
      };
      try {
        return await trainModel({
          shopId: req.shop!.id,
          retrainAll: body.retrainAll,
          deploy: body.deploy,
          rolloutPercentage: body.rolloutPercentage,
        });
      } catch (error) {
        return aiErrorReply(reply, error);
      }
    },
  );

  app.post<{ Params: { version: string } }>(
    '/admin/ai/models/:version/deploy',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const body = (request.body ?? {}) as { rolloutPercentage?: number };
      try {
        return await deployModel(request.params.version, {
          shopId: req.shop!.id,
          rolloutPercentage: body.rolloutPercentage,
        });
      } catch (error) {
        return aiErrorReply(reply, error);
      }
    },
  );

  app.post('/admin/ai/score', { preHandler: auth }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    try {
      const contracts = await prisma.subscriptionContract.findMany({
        where: {
          shopId: req.shop!.id,
          status: { in: ACTIVE_FOR_SCORING },
        },
        select: { id: true },
        take: 2_000,
      });
      const contractIds = contracts.map((c) => c.id);
      if (contractIds.length === 0) {
        return {
          count: 0,
          predictions: [],
          message: 'No active contracts to score',
        };
      }
      return await batchPredict(contractIds);
    } catch (error) {
      return aiErrorReply(reply, error);
    }
  });

  app.post(
    '/admin/ai/interventions/run',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      try {
        return await evaluateInterventionsBatch(req.shop!.id);
      } catch (error) {
        return aiErrorReply(reply, error);
      }
    },
  );

  app.post(
    '/admin/ai/pipeline/run',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      try {
        return await runShopPipeline(req.shop!.id);
      } catch (error) {
        return aiErrorReply(reply, error);
      }
    },
  );
}
