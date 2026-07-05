import type { Shop } from '@retain/database';
import { env } from '../env.js';
import { shopifyAdminGraphql } from './shopify-client.js';

export const THEME_BLOCK_HANDLE = env.THEME_EXTENSION_BLOCK_HANDLE;

export type StorefrontWidgetStatus = 'active' | 'inactive' | 'unknown';
export type StorefrontWidgetSource = 'retain_block' | 'theme_native';

export type StorefrontWidgetInfo = {
  status: StorefrontWidgetStatus;
  source: StorefrontWidgetSource | null;
  themeName: string | null;
  blockHandle: string;
  deepLinkUrl: string;
};

const BASE_THEME_FILES = [
  'templates/product.json',
  'config/settings_data.json',
] as const;

const COMMON_PRODUCT_SECTIONS = [
  'sections/main-product.liquid',
  'sections/featured-product.liquid',
  'sections/product-information.liquid',
] as const;

const THEME_FILES_QUERY = `#graphql
  query RetainThemeWidgetFiles($filenames: [String!]!) {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        files(filenames: $filenames) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }
`;

export function buildThemeEditorDeepLink(shopDomain: string): string {
  const addAppBlockId = `${env.SHOPIFY_API_KEY}/${THEME_BLOCK_HANDLE}`;
  const params = new URLSearchParams({
    template: 'product',
    addAppBlockId,
    target: 'mainSection',
  });
  return `https://${shopDomain}/admin/themes/current/editor?${params.toString()}`;
}

/** Shopify theme JSON files often start with a block comment before the JSON body. */
export function stripThemeFileHeader(content: string): string {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '').trim();
}

export function parseThemeJson(
  content: string | null | undefined,
): unknown | null {
  if (!content) return null;
  try {
    return JSON.parse(stripThemeFileHeader(content));
  } catch {
    return null;
  }
}

export function sectionTypesFromProductTemplate(parsed: unknown): string[] {
  if (parsed == null || typeof parsed !== 'object') return [];

  const record = parsed as Record<string, unknown>;
  const sections = record.sections;
  if (sections == null || typeof sections !== 'object') return [];

  const types = new Set<string>();
  for (const section of Object.values(sections as Record<string, unknown>)) {
    if (section == null || typeof section !== 'object') continue;
    const type = (section as Record<string, unknown>).type;
    if (typeof type === 'string' && type.length > 0) {
      types.add(type);
    }
  }

  return [...types];
}

function findActiveBlock(node: unknown, needle: string): boolean {
  if (node == null) return false;

  if (Array.isArray(node)) {
    return node.some((item) => findActiveBlock(item, needle));
  }

  if (typeof node !== 'object') return false;

  const record = node as Record<string, unknown>;

  if (typeof record.type === 'string' && record.type.includes(needle)) {
    return record.disabled !== true;
  }

  for (const value of Object.values(record)) {
    if (findActiveBlock(value, needle)) {
      return true;
    }
  }

  return false;
}

export function parseThemeFilesForRetainBlock(
  files: Array<{ filename: string; content: string | null | undefined }>,
  blockHandle: string = THEME_BLOCK_HANDLE,
): boolean {
  const needle = `/blocks/${blockHandle}/`;

  for (const file of files) {
    if (!file.filename.endsWith('.json')) continue;
    const parsed = parseThemeJson(file.content);
    if (parsed && findActiveBlock(parsed, needle)) {
      return true;
    }
  }

  return false;
}

const NATIVE_SUBSCRIPTION_BLOCK =
  /shopify:\/\/apps\/[^/]+\/blocks\/[^/]*subscription/i;

const NATIVE_LIQUID_PATTERNS = [
  /selling_plan_groups/,
  /selling_plan_allocations/,
  /name=["']selling_plan["']/,
  /product-subscription/,
  /subscription-picker/,
  /selling-plan-picker/,
];

export function parseThemeFilesForNativeSellingPlans(
  files: Array<{ filename: string; content: string | null | undefined }>,
): boolean {
  for (const file of files) {
    if (!file.content) continue;

    if (file.filename.endsWith('.json')) {
      const parsed = parseThemeJson(file.content);
      if (parsed && findNativeSubscriptionInJson(parsed)) {
        return true;
      }
      continue;
    }

    if (
      file.filename.startsWith('sections/') &&
      file.filename.endsWith('.liquid') &&
      liquidHasSellingPlanPicker(file.content)
    ) {
      return true;
    }
  }

  return false;
}

function findNativeSubscriptionInJson(node: unknown): boolean {
  if (node == null) return false;

  if (Array.isArray(node)) {
    return node.some((item) => findNativeSubscriptionInJson(item));
  }

  if (typeof node !== 'object') return false;

  const record = node as Record<string, unknown>;

  if (
    typeof record.type === 'string' &&
    NATIVE_SUBSCRIPTION_BLOCK.test(record.type) &&
    record.disabled !== true
  ) {
    return true;
  }

  for (const value of Object.values(record)) {
    if (findNativeSubscriptionInJson(value)) {
      return true;
    }
  }

  return false;
}

function liquidHasSellingPlanPicker(content: string): boolean {
  return NATIVE_LIQUID_PATTERNS.some((pattern) => pattern.test(content));
}

/** @deprecated Use parseThemeFilesForRetainBlock */
export function parseThemeFilesForWidget(
  files: Array<{ filename: string; content: string | null | undefined }>,
  blockHandle: string = THEME_BLOCK_HANDLE,
): boolean {
  return parseThemeFilesForRetainBlock(files, blockHandle);
}

export function evaluateStorefrontWidget(
  files: Array<{ filename: string; content: string | null | undefined }>,
  blockHandle: string = THEME_BLOCK_HANDLE,
): Pick<StorefrontWidgetInfo, 'status' | 'source'> {
  const retainBlock = parseThemeFilesForRetainBlock(files, blockHandle);
  if (retainBlock) {
    return { status: 'active', source: 'retain_block' };
  }

  const themeNative = parseThemeFilesForNativeSellingPlans(files);
  if (themeNative) {
    return { status: 'active', source: 'theme_native' };
  }

  return { status: 'inactive', source: null };
}

function sectionFilenamesFromTypes(types: string[]): string[] {
  return types.map((type) => `sections/${type}.liquid`);
}

async function fetchThemeFiles(
  shop: Shop,
  filenames: string[],
): Promise<Array<{ filename: string; content: string | null }>> {
  if (filenames.length === 0) return [];

  const data = await shopifyAdminGraphql<{
    themes: {
      nodes: Array<{
        files: {
          nodes: Array<{
            filename: string;
            body: { content?: string | null } | null;
          }>;
        };
      }>;
    };
  }>(shop, THEME_FILES_QUERY, { filenames });

  const theme = data.themes.nodes[0];
  if (!theme) return [];

  return theme.files.nodes.map((file) => ({
    filename: file.filename,
    content: file.body?.content ?? null,
  }));
}

export async function getStorefrontWidgetInfo(
  shop: Shop,
): Promise<StorefrontWidgetInfo> {
  const deepLinkUrl = buildThemeEditorDeepLink(shop.shopifyDomain);

  try {
    const baseFiles = await fetchThemeFiles(shop, [...BASE_THEME_FILES]);
    const themeMeta = await shopifyAdminGraphql<{
      themes: { nodes: Array<{ name: string }> };
    }>(
      shop,
      `#graphql
        query RetainThemeName {
          themes(first: 1, roles: [MAIN]) {
            nodes { name }
          }
        }
      `,
    );

    const themeName = themeMeta.themes.nodes[0]?.name ?? null;

    const productJsonFile = baseFiles.find(
      (file) => file.filename === 'templates/product.json',
    );
    const sectionTypes = sectionTypesFromProductTemplate(
      parseThemeJson(productJsonFile?.content),
    );

    const sectionFilenames = [
      ...new Set([
        ...COMMON_PRODUCT_SECTIONS,
        ...sectionFilenamesFromTypes(sectionTypes),
      ]),
    ];

    const sectionFiles =
      sectionFilenames.length > 0
        ? await fetchThemeFiles(shop, sectionFilenames)
        : [];

    const allFiles = [...baseFiles, ...sectionFiles];
    const evaluation = evaluateStorefrontWidget(allFiles);

    return {
      ...evaluation,
      themeName,
      blockHandle: THEME_BLOCK_HANDLE,
      deepLinkUrl,
    };
  } catch {
    return {
      status: 'unknown',
      source: null,
      themeName: null,
      blockHandle: THEME_BLOCK_HANDLE,
      deepLinkUrl,
    };
  }
}
