import { BlockStack, Divider, InlineStack, Text } from '@shopify/polaris';

type OrderSummaryProps = {
  subtotal: number;
  deliveryPrice: number;
};

function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

export function OrderSummary({ subtotal, deliveryPrice }: OrderSummaryProps) {
  const total = subtotal + deliveryPrice;

  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm">
        Order total
      </Text>
      <BlockStack gap="100">
        <InlineStack align="space-between">
          <Text as="span" tone="subdued">
            Subtotal
          </Text>
          <Text as="span">${formatMoney(subtotal)}</Text>
        </InlineStack>
        <InlineStack align="space-between">
          <Text as="span" tone="subdued">
            Delivery
          </Text>
          <Text as="span">${formatMoney(deliveryPrice)}</Text>
        </InlineStack>
        <Divider />
        <InlineStack align="space-between">
          <Text as="span" fontWeight="semibold">
            Total
          </Text>
          <Text as="span" fontWeight="semibold">
            ${formatMoney(total)}
          </Text>
        </InlineStack>
      </BlockStack>
    </BlockStack>
  );
}
