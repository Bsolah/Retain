import type { Shop } from '@retain/database';
import { shopifyAdminGraphql } from './shopify-client.js';

export type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredImageUrl: string | null;
  variants: Array<{ id: string; title: string; price: string }>;
};

export type CatalogCollection = {
  id: string;
  title: string;
  handle: string;
};

export async function searchProducts(
  shop: Shop,
  query: string,
  first = 20,
): Promise<CatalogProduct[]> {
  const data = await shopifyAdminGraphql<{
    products: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          handle: string;
          status: string;
          featuredImage: { url: string } | null;
          variants: {
            edges: Array<{
              node: { id: string; title: string; price: string };
            }>;
          };
        };
      }>;
    };
  }>(
    shop,
    `#graphql
      query SearchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              status
              featuredImage {
                url
              }
              variants(first: 25) {
                edges {
                  node {
                    id
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }
    `,
    { query: query.trim() || 'status:active', first },
  );

  return data.products.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    featuredImageUrl: node.featuredImage?.url ?? null,
    variants: node.variants.edges.map(({ node: variant }) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
    })),
  }));
}

export async function listCollections(
  shop: Shop,
  first = 50,
): Promise<CatalogCollection[]> {
  const data = await shopifyAdminGraphql<{
    collections: {
      edges: Array<{
        node: { id: string; title: string; handle: string };
      }>;
    };
  }>(
    shop,
    `#graphql
      query ListCollections($first: Int!) {
        collections(first: $first) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `,
    { first },
  );

  return data.collections.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
  }));
}
