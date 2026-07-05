import { BlockStack, Card, Text } from '@shopify/polaris';
import type { CSSProperties } from 'react';
import {
  formatJoinMonth,
  formatRetentionColumn,
} from '../../lib/cohort-labels';
import type { CohortRow } from '../../types/analytics';

function retentionColor(value: number): string {
  if (value > 50) return '#d1fae5';
  if (value >= 25) return '#fef3c7';
  return '#fee2e2';
}

export function CohortRetentionTable({ cohorts }: { cohorts: CohortRow[] }) {
  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h3" variant="headingMd">
            Who is still subscribed?
          </Text>
          <Text as="p" tone="subdued">
            Each row is everyone who started a subscription in that month. The
            colored cells show what share were still active 1, 3, 6 months
            later. Greener means more customers stuck around.
          </Text>
        </BlockStack>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Sign-up month</th>
                <th style={th}>Subscribers</th>
                <th style={th}>Avg. revenue</th>
                <th style={th}>Payback est.</th>
                {Array.from({ length: 13 }, (_, index) => (
                  <th
                    key={index}
                    style={th}
                    title={
                      index === 0 ? 'At signup' : `${index} months after signup`
                    }
                  >
                    {formatRetentionColumn(index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.month}>
                  <td style={td}>{formatJoinMonth(cohort.month)}</td>
                  <td style={td}>{cohort.size}</td>
                  <td style={td}>${cohort.ltv.toFixed(0)}</td>
                  <td style={td}>
                    {cohort.cacPaybackMonths != null
                      ? `${cohort.cacPaybackMonths} mo`
                      : '—'}
                  </td>
                  {cohort.retention.map((value, index) => (
                    <td
                      key={`${cohort.month}-${index}`}
                      style={{
                        ...td,
                        background: retentionColor(value),
                        textAlign: 'center',
                      }}
                      title={`${value.toFixed(0)}% still subscribed`}
                    >
                      {value.toFixed(0)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Text as="p" tone="subdued" variant="bodySm">
          Avg. revenue is total spend per subscriber in that group. Payback est.
          is a rough guide to how quickly that group may cover acquisition
          costs.
        </Text>
      </BlockStack>
    </Card>
  );
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '1px solid #e2e8f0',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const td: CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
