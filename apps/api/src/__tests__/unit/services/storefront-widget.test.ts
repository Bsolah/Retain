import { describe, expect, it } from '@jest/globals';
import {
  evaluateStorefrontWidget,
  extractReferencedSnippetFilenames,
  parseThemeFilesForNativeSellingPlans,
  parseThemeFilesForRetainBlock,
  parseThemeJson,
  stripThemeFileHeader,
} from '../../../services/storefront-widget.js';

describe('stripThemeFileHeader', () => {
  it('removes leading block comments from theme JSON', () => {
    const raw = `/*
 * IMPORTANT: auto-generated
 */
{"sections":{}}`;

    expect(stripThemeFileHeader(raw)).toBe('{"sections":{}}');
    expect(parseThemeJson(raw)).toEqual({ sections: {} });
  });
});

describe('parseThemeFilesForRetainBlock', () => {
  it('detects an active app block on the product template', () => {
    const productJson = JSON.stringify({
      sections: {
        main: {
          type: 'main-product',
          blocks: {
            abc: {
              type: 'shopify://apps/retain/blocks/purchase-options/uuid-1',
              settings: {},
            },
          },
        },
      },
    });

    expect(
      parseThemeFilesForRetainBlock([
        { filename: 'templates/product.json', content: productJson },
      ]),
    ).toBe(true);
  });

  it('detects blocks when Shopify wraps JSON in a comment header', () => {
    const productJson = `/*
 * theme file
 */
${JSON.stringify({
  sections: {
    main: {
      blocks: {
        abc: {
          type: 'shopify://apps/retain/blocks/purchase-options/uuid-1',
        },
      },
    },
  },
})}`;

    expect(
      parseThemeFilesForRetainBlock([
        { filename: 'templates/product.json', content: productJson },
      ]),
    ).toBe(true);
  });

  it('ignores disabled blocks', () => {
    const productJson = JSON.stringify({
      sections: {
        main: {
          blocks: {
            abc: {
              type: 'shopify://apps/retain/blocks/purchase-options/uuid-1',
              disabled: true,
            },
          },
        },
      },
    });

    expect(
      parseThemeFilesForRetainBlock([
        { filename: 'templates/product.json', content: productJson },
      ]),
    ).toBe(false);
  });
});

describe('extractReferencedSnippetFilenames', () => {
  it('collects render/include targets from section liquid', () => {
    expect(
      extractReferencedSnippetFilenames([
        "{% render 'product-variant-picker', product: product %}",
        "{%- include 'price' -%}",
      ]),
    ).toEqual([
      'snippets/product-variant-picker.liquid',
      'snippets/price.liquid',
    ]);
  });
});

describe('parseThemeFilesForNativeSellingPlans', () => {
  it('detects Dawn-style selling plan markup in section liquid', () => {
    expect(
      parseThemeFilesForNativeSellingPlans([
        {
          filename: 'sections/main-product.liquid',
          content: '{% for group in product.selling_plan_groups %}',
        },
      ]),
    ).toBe(true);
  });

  it('detects selling_plan_groups in snippets referenced by sections', () => {
    expect(
      parseThemeFilesForNativeSellingPlans([
        {
          filename: 'sections/main-product.liquid',
          content: "{% render 'product-variant-picker' %}",
        },
        {
          filename: 'snippets/product-variant-picker.liquid',
          content: '{% for group in product.selling_plan_groups %}',
        },
      ]),
    ).toBe(true);
  });

  it('detects Shopify Subscriptions app blocks in product.json', () => {
    expect(
      parseThemeFilesForNativeSellingPlans([
        {
          filename: 'templates/product.json',
          content: JSON.stringify({
            sections: {
              main: {
                blocks: {
                  sub: {
                    type: 'shopify://apps/shopify-subscriptions/blocks/subscription_widget/uuid',
                  },
                },
              },
            },
          }),
        },
      ]),
    ).toBe(true);
  });
});

describe('evaluateStorefrontWidget', () => {
  it('prefers retain block over theme native when both exist', () => {
    const result = evaluateStorefrontWidget([
      {
        filename: 'templates/product.json',
        content: JSON.stringify({
          sections: {
            main: {
              blocks: {
                retain: {
                  type: 'shopify://apps/retain/blocks/purchase-options/uuid-1',
                },
              },
            },
          },
        }),
      },
      {
        filename: 'sections/main-product.liquid',
        content: '{% for group in product.selling_plan_groups %}',
      },
    ]);

    expect(result).toEqual({ status: 'active', source: 'retain_block' });
  });

  it('marks theme-native themes active without a Retain block', () => {
    const result = evaluateStorefrontWidget([
      {
        filename: 'sections/main-product.liquid',
        content: '<input name="selling_plan" type="hidden">',
      },
    ]);

    expect(result).toEqual({ status: 'active', source: 'theme_native' });
  });

  it('marks themes active when selling_plan_groups only appears in a snippet', () => {
    const result = evaluateStorefrontWidget([
      {
        filename: 'sections/main-product.liquid',
        content: "{% render 'buy-buttons', product: product %}",
      },
      {
        filename: 'snippets/buy-buttons.liquid',
        content: '{% if product.selling_plan_groups.size > 0 %}',
      },
    ]);

    expect(result).toEqual({ status: 'active', source: 'theme_native' });
  });
});
