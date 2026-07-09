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

const METRIC_EXPLANATIONS: Record<string, string> = {
  Precision:
    'When AI flags a subscriber as at-risk, this is how often it is correct.',
  Recall:
    'Of all subscribers who churn, this is how many the AI catches early.',
  F1: 'A balanced score that combines precision and recall.',
  AUC: 'How well the model separates low-risk vs high-risk subscribers overall.',
};

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
        <Banner tone="info" title="What this page tells you">
          <p>
            Use this page to understand whether Retain AI is accurately spotting
            churn risk and whether AI-driven interventions are saving revenue.
          </p>
        </Banner>
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
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Current AI model: {data.activeModel.version}
              </Text>
              <Text as="p" tone="subdued">
                Traffic rollout: {data.activeModel.rolloutPercentage}%
              </Text>
              <Text as="p" tone="subdued">
                Higher percentages below usually mean better model quality.
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
                      <Text as="p" tone="subdued" variant="bodySm">
                        {METRIC_EXPLANATIONS[metric.name]}
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
              No model is currently available for this store. Once a model is
              trained and deployed, this section will show quality scores
              (precision, recall, F1, AUC).
            </p>
          </Banner>
        )}

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                AI intervention results by type
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Success rate shows the share of sent interventions that were
                accepted.
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
                What the model pays most attention to
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                These factors have the strongest impact on churn predictions.
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
              Estimated revenue saved
            </Text>
            <Text as="p" variant="headingLg">
              ${(data?.revenueSaved ?? 0).toLocaleString()}
            </Text>
            <Text as="p" tone="subdued">
              Total revenue impact from interventions marked as saved.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              Model history
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Track which model is live, when it was created, and rollout
              percentage.
            </Text>
            <DataTable
              columnContentTypes={['text', 'text', 'numeric', 'text']}
              headings={['Model version', 'Live now', 'Rollout %', 'Created']}
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
              Compare two model versions
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Use this to decide which model performs better before or during
              rollout.
            </Text>
            <InlineGrid columns={2} gap="300">
              <Select
                label="Model A (baseline)"
                options={historyOptions}
                value={versionA}
                onChange={setVersionA}
              />
              <Select
                label="Model B (candidate)"
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
                Select two model versions to compare quality scores.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
