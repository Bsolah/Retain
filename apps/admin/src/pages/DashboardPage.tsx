import {
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  InlineGrid,
  Page,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DateRangeSelector } from '../components/analytics/DateRangeSelector';
import { MetricCard } from '../components/analytics/MetricCard';
import { StorefrontWidgetBanner } from '../components/setup/StorefrontWidgetBanner';
import { useDashboardOverview } from '../hooks/useAnalytics';
import { downloadCsv } from '../lib/analytics-api';
import type { DateRangeKey, DashboardOverview } from '../types/analytics';

const PIE_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed'];
const GROWTH_VIEWS: Array<30 | 90 | 365> = [30, 90, 365];

export function DashboardPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRangeKey>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [growthDays, setGrowthDays] = useState<30 | 90 | 365>(30);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useDashboardOverview(
      range,
      range === 'custom' ? customStart : undefined,
      range === 'custom' ? customEnd : undefined,
      growthDays,
    );

  const exportRows = useMemo(() => buildExportRows(data), [data]);

  return (
    <Page
      title="Dashboard"
      primaryAction={{
        content: isFetching ? 'Refreshing…' : 'Refresh',
        onAction: () => void refetch(),
        loading: isFetching,
      }}
      secondaryActions={[
        {
          content: 'Get support',
          onAction: () => navigate('/support'),
        },
        {
          content: 'Export CSV',
          onAction: () => downloadCsv('dashboard-analytics.csv', exportRows),
          disabled: exportRows.length === 0,
        },
      ]}
    >
      <BlockStack gap="400">
        <StorefrontWidgetBanner showWhenUnknown />

        <DateRangeSelector
          range={range}
          customStart={customStart}
          customEnd={customEnd}
          onRangeChange={setRange}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />

        {isLoading ? <Spinner accessibilityLabel="Loading dashboard" /> : null}
        {isError ? (
          <Banner
            tone="critical"
            title="Could not load dashboard"
            action={{ content: 'Retry', onAction: () => void refetch() }}
          >
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </Banner>
        ) : null}

        {data ? (
          <>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="400">
              <MetricCard
                title="Active subscribers"
                metric={data.metrics.activeSubscribers}
              />
              <MetricCard title="MRR" metric={data.metrics.mrr} prefix="$" />
              <MetricCard title="ARR" metric={data.metrics.arr} prefix="$" />
              <MetricCard
                title="Churn rate"
                metric={data.metrics.churnRate}
                suffix="%"
              />
              <MetricCard title="LTV" metric={data.metrics.ltv} prefix="$" />
              <MetricCard
                title="New subscribers this month"
                metric={data.metrics.newSubscribersThisMonth}
              />
              <MetricCard
                title="Revenue this month"
                metric={data.metrics.revenueThisMonth}
                prefix="$"
              />
              <MetricCard
                title="Interventions sent"
                metric={data.metrics.interventionsSent}
              />
              <MetricCard
                title="Interventions accepted"
                metric={data.metrics.interventionsAccepted}
              />
              <MetricCard
                title="Revenue saved"
                metric={data.metrics.revenueSaved}
                prefix="$"
              />
            </InlineGrid>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Card>
                <BlockStack gap="300">
                  <InlineGrid columns={2}>
                    <Text as="h3" variant="headingMd">
                      Subscriber growth
                    </Text>
                    <ButtonGroup variant="segmented">
                      {GROWTH_VIEWS.map((days) => (
                        <Button
                          key={days}
                          size="slim"
                          pressed={growthDays === days}
                          onClick={() => setGrowthDays(days)}
                        >
                          {`${days}d`}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </InlineGrid>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={data.charts.subscriberGrowth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => String(value).slice(5)}
                        />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="subscribers"
                          stroke="#4f46e5"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    MRR trend with churn overlay
                  </Text>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={data.charts.mrrTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => String(value).slice(5)}
                        />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="mrr"
                          name="MRR"
                          stroke="#059669"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="churned"
                          name="Churned"
                          stroke="#dc2626"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    Churn rate trend (voluntary vs involuntary)
                  </Text>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <AreaChart data={data.charts.churnTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => String(value).slice(5)}
                        />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="voluntary"
                          stackId="1"
                          stroke="#d97706"
                          fill="#fde68a"
                        />
                        <Area
                          type="monotone"
                          dataKey="involuntary"
                          stackId="1"
                          stroke="#dc2626"
                          fill="#fecaca"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    Revenue breakdown by plan type
                  </Text>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={data.charts.revenueByPlanType}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={90}
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {data.charts.revenueByPlanType.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={PIE_COLORS[index % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </BlockStack>
              </Card>
            </InlineGrid>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Top performing interventions
                </Text>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.charts.topInterventions}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="type" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="sent" name="Sent" fill="#94a3b8" />
                      <Bar dataKey="accepted" name="Accepted" fill="#4f46e5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </BlockStack>
            </Card>
          </>
        ) : null}
      </BlockStack>
    </Page>
  );
}

function buildExportRows(data: DashboardOverview | undefined) {
  if (!data) return [];
  const metricRows = Object.entries(data.metrics).map(([key, metric]) => ({
    section: 'metric',
    key,
    value: metric.value,
    changePct: metric.changePct ?? '',
    acceptanceRate: metric.acceptanceRate ?? '',
  }));
  const growthRows = data.charts.subscriberGrowth.map((row) => ({
    section: 'subscriber_growth',
    ...row,
  }));
  const mrrRows = data.charts.mrrTrend.map((row) => ({
    section: 'mrr_trend',
    ...row,
  }));
  const churnRows = data.charts.churnTrend.map((row) => ({
    section: 'churn_trend',
    ...row,
  }));
  const planRows = data.charts.revenueByPlanType.map((row) => ({
    section: 'revenue_by_plan',
    ...row,
  }));
  const interventionRows = data.charts.topInterventions.map((row) => ({
    section: 'top_interventions',
    ...row,
  }));
  return [
    ...metricRows,
    ...growthRows,
    ...mrrRows,
    ...churnRows,
    ...planRows,
    ...interventionRows,
  ];
}
