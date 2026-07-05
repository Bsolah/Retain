import {
  Banner,
  BlockStack,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CohortRetentionTable } from '../components/analytics/CohortRetentionTable';
import { useCohorts } from '../hooks/useAnalytics';
import {
  formatJoinMonth,
  formatMonthsAfterSignup,
  formatSubscriberGroup,
} from '../lib/cohort-labels';
import type { CohortRow } from '../types/analytics';

export function CohortsPage() {
  const [channel, setChannel] = useState('all');
  const [product, setProduct] = useState('all');
  const [geo, setGeo] = useState('all');
  const [discount, setDiscount] = useState('all');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  const filters = useMemo(
    () => ({
      channel: channel === 'all' ? undefined : channel,
      product: product === 'all' ? undefined : product,
      geography: geo === 'all' ? undefined : geo,
      discount: discount === 'all' ? undefined : discount,
    }),
    [channel, product, geo, discount],
  );

  const { data, isLoading, isError, error, refetch } = useCohorts(filters);
  const cohorts = data?.cohorts ?? [];

  const options = useMemo(
    () => [
      { label: 'Choose a sign-up month', value: '' },
      ...cohorts.map((cohort) => ({
        label: formatJoinMonth(cohort.month),
        value: cohort.month,
      })),
    ],
    [cohorts],
  );

  const left = cohorts.find((cohort) => cohort.month === compareA);
  const right = cohorts.find((cohort) => cohort.month === compareB);
  const comparisonData = useMemo(() => {
    if (!left || !right) return [];
    return left.retention.map((value, index) => ({
      month: formatMonthsAfterSignup(index),
      [formatJoinMonth(left.month)]: value,
      [formatJoinMonth(right.month)]: right.retention[index] ?? 0,
    }));
  }, [left, right]);

  const leftLabel = left ? formatJoinMonth(left.month) : '';
  const rightLabel = right ? formatJoinMonth(right.month) : '';

  return (
    <Page
      title="Subscriber retention"
      subtitle="See whether customers who joined in different months stay subscribed and spend more over time."
    >
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            <strong>How to read this page:</strong> group your subscribers by
            the month they first signed up. Then compare how many are still
            active a few months later. If March sign-ups keep subscribing longer
            than January sign-ups, your offer, onboarding, or product changes
            may be working better.
          </p>
        </Banner>

        <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
          <Select
            label="How they found you"
            options={[
              { label: 'All', value: 'all' },
              ...(data?.filters.channels.map((item) => ({
                label: item,
                value: item,
              })) ?? []),
            ]}
            value={channel}
            onChange={setChannel}
          />
          <Select
            label="First product subscribed"
            options={[
              { label: 'All', value: 'all' },
              ...(data?.filters.products.map((item) => ({
                label: item.split('/').pop() ?? item,
                value: item,
              })) ?? []),
            ]}
            value={product}
            onChange={setProduct}
          />
          <Select
            label="Started with a discount"
            options={
              data?.filters.discounts ?? [
                { label: 'All', value: 'all' },
                { label: 'With discount', value: 'with_discount' },
                { label: 'Without discount', value: 'without_discount' },
              ]
            }
            value={discount}
            onChange={setDiscount}
          />
          <Select
            label="Customer location"
            options={[
              { label: 'All', value: 'all' },
              ...(data?.filters.geographies.map((item) => ({
                label: item,
                value: item,
              })) ?? []),
            ]}
            value={geo}
            onChange={setGeo}
          />
        </InlineGrid>

        {isLoading ? (
          <Spinner accessibilityLabel="Loading retention data" />
        ) : null}
        {isError ? (
          <Banner
            tone="critical"
            title="Could not load retention data"
            action={{ content: 'Retry', onAction: () => void refetch() }}
          >
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </Banner>
        ) : null}

        {!isLoading && !isError && cohorts.length === 0 ? (
          <Banner tone="info">
            <p>
              No subscription sign-ups yet. Once customers start subscribing,
              you&apos;ll see retention by sign-up month here.
            </p>
          </Banner>
        ) : null}

        {cohorts.length > 0 ? <CohortRetentionTable cohorts={cohorts} /> : null}

        <Card>
          <BlockStack gap="300">
            <BlockStack gap="100">
              <Text as="h3" variant="headingMd">
                Compare two sign-up months
              </Text>
              <Text as="p" tone="subdued">
                Pick two months to see which group kept more subscribers and
                earned more per customer.
              </Text>
            </BlockStack>
            <InlineStack gap="300">
              <div style={{ minWidth: 180 }}>
                <Select
                  label="First month"
                  options={options}
                  value={compareA}
                  onChange={setCompareA}
                />
              </div>
              <div style={{ minWidth: 180 }}>
                <Select
                  label="Second month"
                  options={options}
                  value={compareB}
                  onChange={setCompareB}
                />
              </div>
            </InlineStack>
            {left && right ? (
              <BlockStack gap="400">
                <InlineGrid columns={2} gap="400">
                  <CohortSummary
                    title={formatSubscriberGroup(left.month)}
                    cohort={left}
                  />
                  <CohortSummary
                    title={formatSubscriberGroup(right.month)}
                    cohort={right}
                  />
                </InlineGrid>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <LineChart data={comparisonData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip formatter={(value: number) => `${value}%`} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey={leftLabel}
                        stroke="#4f46e5"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey={rightLabel}
                        stroke="#059669"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <Text as="p" tone="subdued" variant="bodySm">
                  The chart shows the percentage of each group still subscribed
                  at signup, then 1, 2, 3 months later, and so on.
                </Text>
              </BlockStack>
            ) : (
              <Text as="p" tone="subdued">
                Choose two sign-up months above to compare them side by side.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function CohortSummary({
  title,
  cohort,
}: {
  title: string;
  cohort: CohortRow;
}) {
  return (
    <BlockStack gap="200">
      <Text as="h4" variant="headingSm">
        {title}
      </Text>
      <Text as="p">Subscribers: {cohort.size}</Text>
      <Text as="p">Avg. revenue per subscriber: ${cohort.ltv.toFixed(2)}</Text>
      <Text as="p">
        Estimated payback:{' '}
        {cohort.cacPaybackMonths != null
          ? `${cohort.cacPaybackMonths} months`
          : '—'}
      </Text>
      <Text as="p">
        Still subscribed at signup: {cohort.retention[0]?.toFixed(1)}%
      </Text>
      <Text as="p">
        Still subscribed after 3 months: {cohort.retention[3]?.toFixed(1)}%
      </Text>
      <Text as="p">
        Still subscribed after 6 months: {cohort.retention[6]?.toFixed(1)}%
      </Text>
    </BlockStack>
  );
}
