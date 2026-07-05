import Handlebars from 'handlebars';
import { prisma } from '@retain/database';
import {
  DEFAULT_EMAIL_TEMPLATES,
  PREVIEW_TEMPLATE_VARIABLES,
  type DefaultTemplateName,
} from './email-template-defaults.js';

export type ResolvedTemplate = {
  id: string | null;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: string[];
  isDefault: boolean;
  isOverridden: boolean;
  subjectVariants: string[];
};

function compile(source: string, variables: Record<string, unknown>): string {
  return Handlebars.compile(source)(variables);
}

export function pickSubject(template: {
  subject: string;
  subjectVariants?: unknown;
}): string {
  const variants = Array.isArray(template.subjectVariants)
    ? template.subjectVariants.filter((v): v is string => typeof v === 'string')
    : [];
  if (variants.length === 0) return template.subject;
  const index = Math.floor(Math.random() * (variants.length + 1));
  return index === variants.length ? template.subject : variants[index]!;
}

export async function ensureDefaultTemplates(): Promise<void> {
  for (const template of DEFAULT_EMAIL_TEMPLATES) {
    const existing = await prisma.emailTemplate.findFirst({
      where: { shopId: null, name: template.name, isDefault: true },
    });
    if (existing) continue;

    await prisma.emailTemplate.create({
      data: {
        shopId: null,
        name: template.name,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        variables: template.variables,
        isDefault: true,
      },
    });
  }
}

export async function resolveTemplate(
  shopId: string | null,
  name: string,
): Promise<ResolvedTemplate> {
  await ensureDefaultTemplates();

  const override = shopId
    ? await prisma.emailTemplate.findUnique({
        where: { shopId_name: { shopId, name } },
      })
    : null;

  if (override) {
    return {
      id: override.id,
      name: override.name,
      subject: override.subject,
      bodyHtml: override.bodyHtml,
      bodyText: override.bodyText,
      variables: Array.isArray(override.variables)
        ? (override.variables as string[])
        : [],
      isDefault: false,
      isOverridden: true,
      subjectVariants: Array.isArray(override.subjectVariants)
        ? (override.subjectVariants as string[])
        : [],
    };
  }

  const systemDefault = await prisma.emailTemplate.findFirst({
    where: { shopId: null, name, isDefault: true },
  });

  if (systemDefault) {
    return {
      id: systemDefault.id,
      name: systemDefault.name,
      subject: systemDefault.subject,
      bodyHtml: systemDefault.bodyHtml,
      bodyText: systemDefault.bodyText,
      variables: Array.isArray(systemDefault.variables)
        ? (systemDefault.variables as string[])
        : [],
      isDefault: true,
      isOverridden: false,
      subjectVariants: Array.isArray(systemDefault.subjectVariants)
        ? (systemDefault.subjectVariants as string[])
        : [],
    };
  }

  const builtin = DEFAULT_EMAIL_TEMPLATES.find((item) => item.name === name);
  if (!builtin) {
    throw new Error(`Unknown template: ${name}`);
  }

  return {
    id: null,
    name: builtin.name,
    subject: builtin.subject,
    bodyHtml: builtin.bodyHtml,
    bodyText: builtin.bodyText,
    variables: builtin.variables,
    isDefault: true,
    isOverridden: false,
    subjectVariants: [],
  };
}

export async function listTemplatesForShop(
  shopId: string,
): Promise<ResolvedTemplate[]> {
  await ensureDefaultTemplates();
  const names = DEFAULT_EMAIL_TEMPLATES.map((item) => item.name);
  const resolved = await Promise.all(
    names.map((name) => resolveTemplate(shopId, name)),
  );
  return resolved;
}

export async function upsertShopTemplate(
  shopId: string,
  name: DefaultTemplateName,
  input: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    subjectVariants?: string[];
  },
) {
  await ensureDefaultTemplates();
  const base = await resolveTemplate(shopId, name);

  return prisma.emailTemplate.upsert({
    where: { shopId_name: { shopId, name } },
    create: {
      shopId,
      name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      variables: base.variables,
      isDefault: false,
      subjectVariants: input.subjectVariants ?? [],
    },
    update: {
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      subjectVariants: input.subjectVariants ?? [],
    },
  });
}

export async function resetShopTemplate(
  shopId: string,
  name: DefaultTemplateName,
): Promise<void> {
  await prisma.emailTemplate.deleteMany({
    where: { shopId, name },
  });
}

export function previewTemplateContent(
  template: ResolvedTemplate,
  variables: Record<string, unknown> = PREVIEW_TEMPLATE_VARIABLES,
) {
  const subject = compile(pickSubject(template), variables);
  return {
    subject,
    html: compile(template.bodyHtml, variables),
    text: compile(template.bodyText, variables),
    variables,
  };
}

export function renderTemplateContent(
  template: ResolvedTemplate,
  variables: Record<string, unknown>,
) {
  const subject = compile(pickSubject(template), variables);
  return {
    subject,
    html: compile(template.bodyHtml, variables),
    text: compile(template.bodyText, variables),
  };
}
