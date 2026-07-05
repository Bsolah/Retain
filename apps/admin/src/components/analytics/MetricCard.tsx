import { Badge, Card, InlineStack, Text, BlockStack } from '@shopify/polaris';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import type { MetricValue } from '../../types/analytics';

export function MetricCard({
  title,
  metric,
  prefix = '',
  suffix = '',
}: {
  title: string;
  metric: MetricValue;
  prefix?: string;
  suffix?: string;
}) {
  const change = metric.changePct;
  const tone =
    change == null ? undefined : change >= 0 ? 'success' : 'critical';

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" tone="subdued" variant="bodySm">
          {title}
        </Text>
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingLg">
            {prefix}
            {formatNumber(metric.value)}
            {suffix}
          </Text>
          {change != null ? (
            <Badge tone={tone}>
              {`${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
            </Badge>
          ) : null}
        </InlineStack>
        {metric.acceptanceRate != null ? (
          <Text as="p" tone="subdued">
            Acceptance rate {metric.acceptanceRate.toFixed(1)}%
          </Text>
        ) : null}
        {metric.sparkline && metric.sparkline.length > 1 ? (
          <div style={{ width: '100%', height: 40 }}>
            <ResponsiveContainer>
              <LineChart data={metric.sparkline}>
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
