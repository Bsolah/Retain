import {
  Banner,
  BlockStack,
  Card,
  DataTable,
  InlineGrid,
  Page,
  Select,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAiPerformance } from '../hooks/useAnalytics';

export function AiPerformancePage() {
  const { data, isLoading, isError, error, refetch } = useAiPerformance();
  const [versionA, setVersionA] = useState('');
  const [versionB, setVersionB] = useState('');

  const historyOptions = useMemo(
    () => [
      { label: 'Select model', value: '' },
      ...(data?.modelHistory.map((model) => ({
        label: model.version,
        value: model.version,
      })) ?? []),
    ],
    [data?.modelHistory],
  );

  const modelA = data?.modelHistory.find((model) => model.version === versionA);
  const modelB = data?.modelHistory.find((model) => model.version === versionB);

  const gauges = data?.activeModel
    ? [
        { name: 'Precision', value: data.activeModel.metrics.precision * 100 },
        { name: 'Recall', value: data.activeModel.metrics.recall * 100 },
        { name: 'F1', value: data.activeModel.metrics.f1 * 100 },
        { name: 'AUC', value: data.activeModel.metrics.auc * 100 },
      ]
    : [];

  return (
    <Page title="AI performance">
      <BlockStack gap="400">
        {isLoading ? <Spinner accessibilityLabel="Loading AI metrics" /> : null}
        {isError ? (
          <Banner
            tone="critical"
            title="Could not load AI performance"
            action={{ content: 'Retry', onAction: () => void refetch() }}
          >
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </Banner>
        ) : null}

        {data?.activeModel ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Active model: {data.activeModel.version}
              </Text>
              <Text as="p" tone="subdued">
                Rollout {data.activeModel.rolloutPercentage}%
              </Text>
              <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                {gauges.map((metric) => (
                  <Card key={metric.name}>
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued">
                        {metric.name}
                      </Text>
                      <div style={{ width: '100%', height: 140 }}>
                        <ResponsiveContainer>
                          <RadialBarChart
                            innerRadius="60%"
                            outerRadius="100%"
                            data={[metric]}
                            startAngle={180}
                            endAngle={0}
                          >
                            <PolarAngleAxis
                              type="number"
                              domain={[0, 100]}
                              tick={false}
                            />
                            <RadialBar
                              dataKey="value"
                              cornerRadius={8}
                              background
                            >
                              <Cell fill="#4f46e5" />
                            </RadialBar>
                            <Tooltip />
                          </RadialBarChart>
                        </ResponsiveContainer>
                      </div>
                      <Text as="p" alignment="center" variant="headingMd">
                        {metric.value.toFixed(1)}%
                      </Text>
                    </BlockStack>
                  </Card>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        ) : (
          <Banner tone="info" title="No trained model yet">
            <p>
              Train a model from the AI service to populate accuracy gauges.
            </p>
          </Banner>
        )}

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Intervention success by type
              </Text>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={data?.interventionSuccess ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="successRate" fill="#059669" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Feature importance
              </Text>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart
                    layout="vertical"
                    data={data?.featureImportance ?? []}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="feature" width={160} />
                    <Tooltip />
                    <Bar dataKey="importance" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">
              Revenue saved
            </Text>
            <Text as="p" variant="headingLg">
              ${(data?.revenueSaved ?? 0).toLocaleString()}
            </Text>
            <Text as="p" tone="subdued">
              Sum of revenueImpact on interventions with outcome = saved
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              Model version history
            </Text>
            <DataTable
              columnContentTypes={['text', 'text', 'numeric', 'text']}
              headings={['Version', 'Active', 'Rollout %', 'Created']}
              rows={(data?.modelHistory ?? []).map((model) => [
                model.version,
                model.isActive ? 'Yes' : 'No',
                model.rolloutPercentage,
                new Date(model.createdAt).toLocaleString(),
              ])}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              A/B test comparison
            </Text>
            <InlineGrid columns={2} gap="300">
              <Select
                label="Model A"
                options={historyOptions}
                value={versionA}
                onChange={setVersionA}
              />
              <Select
                label="Model B"
                options={historyOptions}
                value={versionB}
                onChange={setVersionB}
              />
            </InlineGrid>
            {modelA && modelB ? (
              <DataTable
                columnContentTypes={['text', 'numeric', 'numeric']}
                headings={['Metric', modelA.version, modelB.version]}
                rows={['precision', 'recall', 'f1', 'auc'].map((metric) => [
                  metric,
                  Number(modelA.metrics?.[metric] ?? 0).toFixed(3),
                  Number(modelB.metrics?.[metric] ?? 0).toFixed(3),
                ])}
              />
            ) : (
              <Text as="p" tone="subdued">
                Select two model versions to compare metrics.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
