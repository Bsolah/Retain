import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const templateDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../templates',
);

const cache = new Map<string, Handlebars.TemplateDelegate>();

function loadTemplate(name: string): Handlebars.TemplateDelegate {
  const cached = cache.get(name);
  if (cached) return cached;

  const source = readFileSync(join(templateDir, `${name}.hbs`), 'utf8');
  const compiled = Handlebars.compile(source);
  cache.set(name, compiled);
  return compiled;
}

export function renderTemplate(
  name: string,
  context: Record<string, unknown>,
): string {
  return loadTemplate(name)(context);
}

export function renderEmail(
  name: string,
  context: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  const subject = renderTemplate(`${name}-subject`, context).trim();
  const html = renderTemplate(`${name}-html`, context);
  const text = renderTemplate(`${name}-text`, context);
  return { subject, html, text };
}
