import type { FastifyInstance } from 'fastify';
import {
  SUPPORTED_MIGRATION_PLATFORMS,
  type MigrationPlatformName,
} from '@retain/shared';
import {
  createSessionPreHandler,
  type AuthenticatedRequest,
} from '../middleware/session.js';
import {
  discoverMigration,
  getMigration,
  listMigrations,
  updateCommunicationTemplate,
} from '../services/migration/discover.js';
import {
  runMigrationCutover,
  runMigrationRollback,
} from '../services/migration/cutover.js';
import { pullAndValidateMigration } from '../services/migration/pull.js';
import { getMigrationProgress } from '../services/migration/progress.js';
import {
  retryMigrationRecord,
  runMigrationSync,
} from '../services/migration/sync.js';
import { validateMigration } from '../services/migration/validate.js';
import { prisma } from '@retain/database';

function isPlatform(value: string): value is MigrationPlatformName {
  return (SUPPORTED_MIGRATION_PLATFORMS as readonly string[]).includes(value);
}

export async function registerMigrationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const auth = createSessionPreHandler();

  app.get('/migrations', { preHandler: auth }, async (request) => {
    const req = request as AuthenticatedRequest;
    const migrations = await listMigrations(req.shop!.id);
    return migrations.map(formatMigration);
  });

  app.post(
    '/migrations/discover',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const body = request.body as {
        platform?: string;
        apiKey?: string;
        apiSecret?: string;
        csvData?: string;
      };

      if (!body.platform || !isPlatform(body.platform)) {
        return reply.status(400).send({
          message: `platform must be one of: ${SUPPORTED_MIGRATION_PLATFORMS.join(', ')}`,
        });
      }

      const { migration, preview } = await discoverMigration({
        shop: req.shop!,
        platform: body.platform,
        credentials: {
          apiKey: body.apiKey,
          apiSecret: body.apiSecret,
          csvData: body.csvData,
        },
      });

      return {
        migrationId: migration.id,
        status: migration.status,
        preview,
      };
    },
  );

  app.post('/migrations/sync', { preHandler: auth }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    const body = request.body as { migrationId?: string };

    if (!body.migrationId) {
      return reply.status(400).send({ message: 'migrationId is required' });
    }

    const migration = await getMigration(req.shop!.id, body.migrationId);
    if (!migration) {
      return reply.status(404).send({ message: 'Migration not found' });
    }

    try {
      await runMigrationSync(req.shop!, migration.id);
      const updated = await getMigration(req.shop!.id, migration.id);
      return {
        ok: true,
        migrationId: migration.id,
        status: updated?.status ?? migration.status,
        progress: updated?.progress ?? {},
      };
    } catch (error) {
      request.log.error(
        { err: error, migrationId: migration.id },
        'Migration sync failed',
      );
      return reply.status(500).send({
        message:
          error instanceof Error ? error.message : 'Migration sync failed',
      });
    }
  });

  /** Validate = pull all records from the source platform, sync into Retain, then report. */
  app.post(
    '/migrations/validate',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const body = request.body as {
        platform?: string;
        apiKey?: string;
        apiSecret?: string;
        csvData?: string;
      };

      if (!body.platform || !isPlatform(body.platform)) {
        return reply.status(400).send({
          message: `platform must be one of: ${SUPPORTED_MIGRATION_PLATFORMS.join(', ')}`,
        });
      }

      try {
        return await pullAndValidateMigration({
          shop: req.shop!,
          platform: body.platform,
          credentials: {
            apiKey: body.apiKey,
            apiSecret: body.apiSecret,
            csvData: body.csvData,
          },
        });
      } catch (error) {
        request.log.error({ err: error }, 'Migration validate/pull failed');
        return reply.status(500).send({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to pull and validate migration',
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/migrations/:id',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const migration = await getMigration(req.shop!.id, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });
      return formatMigration(migration);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/migrations/:id/validate',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const migration = await getMigration(req.shop!.id, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });
      try {
        return await validateMigration(req.shop!.id, request.params.id);
      } catch (error) {
        return reply.status(400).send({
          message: error instanceof Error ? error.message : 'Validation failed',
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/migrations/:id/progress',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const migration = await getMigration(req.shop!.id, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });

      const live = await getMigrationProgress(request.params.id);
      return (
        live ?? {
          migrationId: migration.id,
          status: migration.status,
          ...(migration.progress as object),
          updatedAt: migration.updatedAt.toISOString(),
        }
      );
    },
  );

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    '/migrations/:id/stream',
    async (request, reply) => {
      const token =
        request.headers.authorization?.replace(/^Bearer\s+/i, '') ??
        request.query.token;

      if (!token) {
        return reply.status(401).send({ message: 'Unauthorized' });
      }

      let shopId: string;
      try {
        const payload = await request.server.jwt.verify<{
          shopId: string;
          aud: string;
        }>(token);
        if (!payload.shopId || payload.aud !== 'retain-admin') {
          return reply.status(401).send({ message: 'Invalid token' });
        }
        shopId = payload.shopId;
      } catch {
        return reply.status(401).send({ message: 'Invalid token' });
      }

      const migration = await getMigration(shopId, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const send = async () => {
        const progress = await getMigrationProgress(request.params.id);
        const payload = progress ?? {
          migrationId: migration.id,
          status: migration.status,
          ...(migration.progress as object),
        };
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      await send();
      const interval = setInterval(() => void send(), 2000);

      request.raw.on('close', () => {
        clearInterval(interval);
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/migrations/:id/cutover',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const migration = await getMigration(req.shop!.id, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });

      const body = (request.body ?? {}) as { cancelSourceOnCutover?: boolean };
      const cancelSourceOnCutover = Boolean(body.cancelSourceOnCutover);

      const report = migration.validationReport as {
        passed?: boolean;
        syncedContractCount?: number;
      } | null;
      const hasSyncedContracts = (report?.syncedContractCount ?? 0) > 0;
      if (
        migration.status !== 'validated' ||
        !report ||
        (!report.passed && !hasSyncedContracts)
      ) {
        return reply.status(400).send({
          message:
            'Migration must be validated with synced contracts before cutoff. Click Validate first.',
        });
      }

      await prisma.migrationJob.update({
        where: { id: migration.id },
        data: {
          settings: {
            ...(migration.settings as object),
            cancelSourceOnCutover,
          },
        },
      });

      try {
        // Run cutover in-request so merchants see success/failure immediately.
        await runMigrationCutover(req.shop!, migration.id, {
          cancelSourceOnCutover,
        });
        const updated = await getMigration(req.shop!.id, migration.id);
        return {
          ok: true,
          status: updated?.status ?? 'completed',
          progress: updated?.progress ?? {},
        };
      } catch (error) {
        request.log.error(
          { err: error, migrationId: migration.id },
          'Migration cutover failed',
        );
        return reply.status(500).send({
          message:
            error instanceof Error ? error.message : 'Migration cutover failed',
        });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/migrations/:id/rollback',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const migration = await getMigration(req.shop!.id, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });

      await runMigrationRollback(req.shop!, request.params.id);
      return { ok: true, status: 'rolled_back' };
    },
  );

  app.post<{ Params: { id: string; recordId: string } }>(
    '/migrations/:id/retry/:recordId',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const migration = await getMigration(req.shop!.id, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });

      await retryMigrationRecord(
        req.shop!,
        request.params.id,
        request.params.recordId,
      );
      return { ok: true };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/migrations/:id/communication-template',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const body = request.body as {
        subject?: string;
        bodyHtml?: string;
        bodyText?: string;
      };

      if (!body.subject || !body.bodyHtml || !body.bodyText) {
        return reply.status(400).send({
          message: 'subject, bodyHtml, and bodyText are required',
        });
      }

      const template = await updateCommunicationTemplate(
        req.shop!.id,
        request.params.id,
        {
          subject: body.subject,
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
        },
      );
      return template.communicationTemplate;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/migrations/:id/errors',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      const migration = await getMigration(req.shop!.id, request.params.id);
      if (!migration) return reply.status(404).send({ message: 'Not found' });

      return prisma.migrationError.findMany({
        where: { migrationId: request.params.id, resolved: false },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    },
  );
}

function formatMigration(migration: {
  id: string;
  platform: string;
  status: string;
  preview: unknown;
  progress: unknown;
  validationReport: unknown;
  communicationTemplate: unknown;
  cutoverAt: Date | null;
  rollbackDeadline: Date | null;
  errorSummary: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  _count?: { records: number; errors: number };
}) {
  return {
    id: migration.id,
    platform: migration.platform,
    status: migration.status,
    preview: migration.preview,
    progress: migration.progress,
    validationReport: migration.validationReport,
    communicationTemplate: migration.communicationTemplate,
    cutoverAt: migration.cutoverAt?.toISOString() ?? null,
    rollbackDeadline: migration.rollbackDeadline?.toISOString() ?? null,
    errorSummary: migration.errorSummary,
    recordCount: migration._count?.records ?? 0,
    errorCount: migration._count?.errors ?? 0,
    createdAt: migration.createdAt.toISOString(),
    updatedAt: migration.updatedAt.toISOString(),
    completedAt: migration.completedAt?.toISOString() ?? null,
  };
}
