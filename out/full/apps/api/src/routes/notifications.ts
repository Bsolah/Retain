import type { FastifyInstance } from 'fastify';
import {
  createSessionPreHandler,
  type AuthenticatedRequest,
} from '../middleware/session.js';
import {
  listTemplatesForShop,
  previewTemplateContent,
  resetShopTemplate,
  resolveTemplate,
  upsertShopTemplate,
} from '../services/email-templates.js';
import type { DefaultTemplateName } from '../services/email-template-defaults.js';

const TEMPLATE_NAMES = new Set<DefaultTemplateName>([
  'subscription_created',
  'subscription_renewal_reminder',
  'payment_failed',
  'intervention_skip_offer',
  'intervention_discount_offer',
  'cancel_confirmation',
  'dunning_retry',
]);

function isTemplateName(name: string): name is DefaultTemplateName {
  return TEMPLATE_NAMES.has(name as DefaultTemplateName);
}

export async function registerNotificationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const auth = createSessionPreHandler();

  app.get(
    '/admin/notifications/templates',
    { preHandler: auth },
    async (request) => {
      const req = request as AuthenticatedRequest;
      return listTemplatesForShop(req.shop!.id);
    },
  );

  app.get<{ Params: { name: string } }>(
    '/admin/notifications/templates/:name',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      if (!isTemplateName(request.params.name)) {
        return reply.status(404).send({ message: 'Unknown template' });
      }
      return resolveTemplate(req.shop!.id, request.params.name);
    },
  );

  app.put<{ Params: { name: string } }>(
    '/admin/notifications/templates/:name',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      if (!isTemplateName(request.params.name)) {
        return reply.status(404).send({ message: 'Unknown template' });
      }

      const body = request.body as {
        subject?: string;
        bodyHtml?: string;
        bodyText?: string;
        subjectVariants?: string[];
      };

      if (!body.subject || !body.bodyHtml || !body.bodyText) {
        return reply.status(400).send({
          message: 'subject, bodyHtml, and bodyText are required',
        });
      }

      const template = await upsertShopTemplate(
        req.shop!.id,
        request.params.name,
        {
          subject: body.subject,
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
          subjectVariants: body.subjectVariants,
        },
      );

      return template;
    },
  );

  app.post<{ Params: { name: string } }>(
    '/admin/notifications/templates/:name/preview',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      if (!isTemplateName(request.params.name)) {
        return reply.status(404).send({ message: 'Unknown template' });
      }

      const template = await resolveTemplate(req.shop!.id, request.params.name);
      const body = (request.body ?? {}) as {
        variables?: Record<string, unknown>;
      };

      return previewTemplateContent(template, body.variables);
    },
  );

  app.post<{ Params: { name: string } }>(
    '/admin/notifications/templates/:name/reset',
    { preHandler: auth },
    async (request, reply) => {
      const req = request as AuthenticatedRequest;
      if (!isTemplateName(request.params.name)) {
        return reply.status(404).send({ message: 'Unknown template' });
      }

      await resetShopTemplate(req.shop!.id, request.params.name);
      return resolveTemplate(req.shop!.id, request.params.name);
    },
  );
}
