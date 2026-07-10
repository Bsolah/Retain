import {
  Autocomplete,
  BlockStack,
  Button,
  Icon,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { useEffect, useMemo, useState } from 'react';
import { useSearchProducts } from '../../hooks/usePlans';
import type { ManualSubscriptionLine } from '../../lib/manual-subscription-api';
import type { ShopifyProduct } from '../../types/plans';

type ProductLineSelectorProps = {
  lines: ManualSubscriptionLine[];
  onLinesChange: (lines: ManualSubscriptionLine[]) => void;
};

type ProductOption = {
  value: string;
  label: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  price: string;
};

function buildOptions(
  products: ShopifyProduct[] | undefined,
  selectedVariantIds: Set<string>,
): ProductOption[] {
  if (!products) return [];

  const options: ProductOption[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      if (selectedVariantIds.has(variant.id)) continue;
      const variantLabel =
        variant.title === 'Default Title' ? '' : ` — ${variant.title}`;
      options.push({
        value: variant.id,
        label: `${product.title}${variantLabel} · $${variant.price}`,
        variantId: variant.id,
        productTitle: product.title,
        variantTitle: variant.title,
        price: variant.price,
      });
    }
  }
  return options;
}

export function ProductLineSelector({
  lines,
  onLinesChange,
}: ProductLineSelectorProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const {
    data: products,
    isLoading,
    isFetching,
  } = useSearchProducts(debouncedQuery, 25);

  const selectedVariantIds = useMemo(
    () => new Set(lines.map((line) => line.variantId)),
    [lines],
  );

  const availableOptions = useMemo(
    () => buildOptions(products, selectedVariantIds),
    [products, selectedVariantIds],
  );

  const addLine = (option: ProductOption) => {
    onLinesChange([
      ...lines,
      {
        variantId: option.variantId,
        title:
          option.variantTitle === 'Default Title'
            ? option.productTitle
            : `${option.productTitle} — ${option.variantTitle}`,
        price: option.price,
        quantity: 1,
      },
    ]);
    setQuery('');
    setSelectedOptions([]);
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    onLinesChange(
      lines.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: Math.max(1, quantity) }
          : line,
      ),
    );
  };

  const removeLine = (variantId: string) => {
    onLinesChange(lines.filter((line) => line.variantId !== variantId));
  };

  const textField = (
    <Autocomplete.TextField
      label="Search products"
      value={query}
      onChange={setQuery}
      placeholder="Search by product name"
      autoComplete="off"
      clearButton
      onClearButtonClick={() => {
        setQuery('');
        setSelectedOptions([]);
      }}
      prefix={<Icon source={SearchIcon} />}
      connectedRight={
        isFetching ? (
          <Spinner accessibilityLabel="Searching products" size="small" />
        ) : undefined
      }
    />
  );

  return (
    <BlockStack gap="300">
      <Autocomplete
        options={availableOptions}
        selected={selectedOptions}
        onSelect={(selected) => {
          const option = availableOptions.find(
            (entry) => entry.value === selected[0],
          );
          if (option) {
            addLine(option);
          }
        }}
        textField={textField}
        loading={isLoading}
        emptyState={
          <Text as="p" tone="subdued">
            {query.trim()
              ? 'No matching products found.'
              : 'Type to search your catalog.'}
          </Text>
        }
      />

      {lines.length > 0 ? (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Selected products ({lines.length})
          </Text>
          {lines.map((line) => (
            <InlineStack
              key={line.variantId}
              align="space-between"
              blockAlign="center"
              gap="300"
              wrap={false}
            >
              <BlockStack gap="050">
                <Text as="p" fontWeight="semibold">
                  {line.title ?? line.variantId}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  ${line.price} each
                </Text>
              </BlockStack>
              <InlineStack gap="200" blockAlign="center">
                <div style={{ width: '5rem' }}>
                  <TextField
                    label="Quantity"
                    labelHidden
                    type="number"
                    autoComplete="off"
                    value={String(line.quantity)}
                    onChange={(value) =>
                      updateQuantity(line.variantId, Number(value) || 1)
                    }
                  />
                </div>
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() => removeLine(line.variantId)}
                >
                  Remove
                </Button>
              </InlineStack>
            </InlineStack>
          ))}
        </BlockStack>
      ) : (
        <Text as="p" tone="subdued">
          Search and select a product variant to add it to this subscription.
        </Text>
      )}
    </BlockStack>
  );
}
