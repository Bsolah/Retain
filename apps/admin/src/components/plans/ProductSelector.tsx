import {
  Banner,
  BlockStack,
  Button,
  Checkbox,
  Collapsible,
  InlineStack,
  ResourceItem,
  ResourceList,
  Spinner,
  Tag,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';
import { useSearchProducts } from '../../hooks/usePlans';
import { getPublicApiUrl, getShopDomain } from '../../lib/session';
import { usePlanWizardStore } from '../../stores/plan-wizard';

const ImagePlaceholder =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#f1f1f1"/><text x="50%" y="54%" text-anchor="middle" fill="#999" font-size="10">No img</text></svg>`,
  );

const COLLAPSED_PRODUCT_COUNT = 8;
const COLLAPSED_TAG_COUNT = 6;
const PRODUCT_LIST_LIMIT = 100;

type ProductSelectorProps = {
  showHints?: boolean;
};

export function ProductSelector({ showHints = false }: ProductSelectorProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError, error, isFetching } = useSearchProducts(
    debouncedQuery,
    PRODUCT_LIST_LIMIT,
  );
  const productIds = usePlanWizardStore((state) => state.productIds);
  const selectedProductTitles = usePlanWizardStore(
    (state) => state.selectedProductTitles,
  );
  const toggleProduct = usePlanWizardStore((state) => state.toggleProduct);
  const selectProducts = usePlanWizardStore((state) => state.selectProducts);
  const clearProducts = usePlanWizardStore((state) => state.clearProducts);

  const shopDomain = getShopDomain();
  const reinstallUrl = shopDomain
    ? `${getPublicApiUrl()}/auth/shopify?shop=${encodeURIComponent(shopDomain)}`
    : null;
  const needsReauth =
    isError &&
    error instanceof Error &&
    /401|access token|re-authorize/i.test(error.message);

  const visibleProducts = useMemo(() => {
    if (!data) return [];
    if (catalogExpanded) return data;
    return data.slice(0, COLLAPSED_PRODUCT_COUNT);
  }, [catalogExpanded, data]);

  const hiddenProductCount = (data?.length ?? 0) - visibleProducts.length;
  const visibleTags = tagsExpanded
    ? productIds
    : productIds.slice(0, COLLAPSED_TAG_COUNT);
  const hiddenTagCount = productIds.length - visibleTags.length;

  const allListedSelected =
    Boolean(data?.length) &&
    (data ?? []).every((product) => productIds.includes(product.id));

  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text as="h3" variant="headingMd">
          Select products
        </Text>
        <Text as="p" tone="subdued">
          {showHints
            ? 'Pick which products customers can subscribe to. Search by name or select all listed products.'
            : 'Choose products for this plan. Use search to narrow the list, or select all listed products at once.'}
        </Text>
      </BlockStack>

      {productIds.length > 0 ? (
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              Selected ({productIds.length})
            </Text>
            <Button variant="plain" onClick={clearProducts}>
              Clear all
            </Button>
          </InlineStack>
          <InlineStack gap="200" wrap>
            {visibleTags.map((id) => (
              <Tag key={id} onRemove={() => toggleProduct(id, '')}>
                {selectedProductTitles[id] ?? id}
              </Tag>
            ))}
          </InlineStack>
          {hiddenTagCount > 0 ? (
            <Button
              variant="plain"
              onClick={() => setTagsExpanded((value) => !value)}
            >
              {tagsExpanded
                ? 'Show fewer'
                : `Show ${hiddenTagCount} more selected`}
            </Button>
          ) : null}
        </BlockStack>
      ) : (
        <Banner tone="warning" title="No products selected yet">
          <p>Select at least one product or collection to save the plan.</p>
        </Banner>
      )}

      <TextField
        label="Search products"
        placeholder={
          showHints
            ? 'e.g. Coffee, Serum, T-shirt…'
            : 'Search by title (leave empty to list active products)'
        }
        helpText={
          showHints
            ? 'Leave empty to browse all active products in your catalog'
            : undefined
        }
        value={query}
        onChange={setQuery}
        autoComplete="off"
        clearButton
        onClearButtonClick={() => setQuery('')}
        connectedRight={
          isFetching ? (
            <Spinner accessibilityLabel="Searching products" size="small" />
          ) : undefined
        }
      />

      {!isLoading && !isError && data && data.length > 0 ? (
        <InlineStack gap="200">
          <Button
            onClick={() => selectProducts(data)}
            disabled={allListedSelected}
          >
            Select all listed ({String(data.length)})
          </Button>
          {productIds.length > 0 ? (
            <Button variant="plain" onClick={clearProducts}>
              Deselect all
            </Button>
          ) : null}
        </InlineStack>
      ) : null}

      {isLoading ? (
        <InlineStack align="center">
          <Spinner accessibilityLabel="Loading products" size="small" />
        </InlineStack>
      ) : null}

      {isError ? (
        <Banner tone="critical" title="Could not load products">
          <p>
            {error instanceof Error ? error.message : 'Failed to load products'}
          </p>
          {needsReauth && reinstallUrl ? (
            <p>
              Open this link in a <strong>new browser tab</strong> to
              re-authorize:{' '}
              <a href={reinstallUrl} target="_top" rel="noopener noreferrer">
                Re-authorize Retain
              </a>
            </p>
          ) : null}
        </Banner>
      ) : null}

      {!isLoading && !isError && data && data.length === 0 ? (
        <Text as="p" tone="subdued">
          No products found. Add products in Shopify Admin, or try a different
          search.
        </Text>
      ) : null}

      {!isLoading && data && data.length > 0 ? (
        <BlockStack gap="200">
          <Collapsible
            open
            id="product-catalog"
            transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
          >
            <ResourceList
              resourceName={{ singular: 'product', plural: 'products' }}
              items={visibleProducts}
              renderItem={(product) => {
                const selected = productIds.includes(product.id);
                return (
                  <ResourceItem
                    id={product.id}
                    accessibilityLabel={`Select ${product.title}`}
                    onClick={() => toggleProduct(product.id, product.title)}
                    media={
                      <Thumbnail
                        source={product.featuredImageUrl || ImagePlaceholder}
                        alt={product.title}
                        size="small"
                      />
                    }
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="050">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {product.title}
                        </Text>
                        <Text as="span" tone="subdued">
                          {product.variants.length} variant
                          {product.variants.length === 1 ? '' : 's'} ·{' '}
                          {product.status.toLowerCase()}
                        </Text>
                      </BlockStack>
                      <div
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          label={`Select ${product.title}`}
                          labelHidden
                          checked={selected}
                          onChange={() =>
                            toggleProduct(product.id, product.title)
                          }
                        />
                      </div>
                    </InlineStack>
                  </ResourceItem>
                );
              }}
            />
          </Collapsible>

          {hiddenProductCount > 0 ? (
            <Button
              variant="plain"
              onClick={() => setCatalogExpanded((value) => !value)}
            >
              {catalogExpanded
                ? 'Show fewer products'
                : `Show ${hiddenProductCount} more products`}
            </Button>
          ) : null}
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}
