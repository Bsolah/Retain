import { Badge, BlockStack, Card, InlineStack, Text } from '@shopify/polaris';
import type { BoxConfig, PlanFrequency, PlanType } from '../../types/plans';

type PlanPreviewCardProps = {
  name: string;
  description: string;
  planType: PlanType;
  frequencies: PlanFrequency[];
  boxConfig?: BoxConfig | null;
  productCount: number;
  collectionCount: number;
};

export function PlanPreviewCard({
  name,
  description,
  planType,
  frequencies,
  boxConfig,
  productCount,
  collectionCount,
}: PlanPreviewCardProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingMd">
            {name || 'Untitled plan'}
          </Text>
          <Badge tone="info">{planType}</Badge>
        </InlineStack>
        <Text as="p" tone="subdued">
          {description || 'Customer-facing description appears here.'}
        </Text>
        <BlockStack gap="100">
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            Delivery options
          </Text>
          {frequencies.map((frequency, index) => (
            <Text as="p" key={`${frequency.unit}-${index}`}>
              Every {frequency.interval} {frequency.unit}
              {frequency.interval > 1 ? 's' : ''}
              {planType === 'prepaid' &&
              frequency.prepaidBillingInterval != null &&
              frequency.prepaidBillingInterval > frequency.interval
                ? ` · billed every ${frequency.prepaidBillingInterval} ${frequency.unit}${frequency.prepaidBillingInterval > 1 ? 's' : ''}`
                : planType === 'prepaid'
                  ? ` · billed every ${frequency.prepaidBillingInterval ?? frequency.interval * 3} ${frequency.unit}s`
                  : ''}
              {frequency.discountPercent != null &&
              frequency.discountPercent > 0
                ? ` · ${frequency.discountPercent}% off`
                : ''}
            </Text>
          ))}
        </BlockStack>
        {planType === 'box' && boxConfig ? (
          <BlockStack gap="100">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              Box
            </Text>
            <Text as="p" tone="subdued">
              {boxConfig.minItems}–{boxConfig.maxItems} items
              {boxConfig.allowSwaps ? ' · swaps allowed' : ' · fixed box'}
              {boxConfig.slots.length > 0
                ? ` · ${boxConfig.slots.length} slot${boxConfig.slots.length === 1 ? '' : 's'}`
                : ''}
            </Text>
          </BlockStack>
        ) : null}
        <Text as="p" tone="subdued">
          {productCount} product{productCount === 1 ? '' : 's'} ·{' '}
          {collectionCount} collection{collectionCount === 1 ? '' : 's'}
        </Text>
      </BlockStack>
    </Card>
  );
}
