import {
  BlockStack,
  Button,
  FormLayout,
  InlineStack,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { usePlanWizardStore } from '../../stores/plan-wizard';
import type { FrequencyUnit } from '../../types/plans';

const UNIT_OPTIONS = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
];

type FrequencyBuilderProps = {
  showHints?: boolean;
};

export function FrequencyBuilder({ showHints = false }: FrequencyBuilderProps) {
  const frequencies = usePlanWizardStore((state) => state.frequencies);
  const planType = usePlanWizardStore((state) => state.planType);
  const addFrequency = usePlanWizardStore((state) => state.addFrequency);
  const updateFrequency = usePlanWizardStore((state) => state.updateFrequency);
  const removeFrequency = usePlanWizardStore((state) => state.removeFrequency);

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h3" variant="headingMd">
          Frequency options
        </Text>
        {showHints ? (
          <Text as="p" tone="subdued">
            Add each delivery interval customers can choose at checkout (e.g.
            every 1 month, every 2 weeks).
            {planType === 'prepaid'
              ? ' For prepaid plans, also set how often they are billed upfront.'
              : null}
          </Text>
        ) : null}
      </BlockStack>
      {frequencies.map((frequency, index) => (
        <FormLayout key={`frequency-${index}`}>
          <FormLayout.Group>
            <TextField
              label="Interval"
              type="number"
              min={1}
              max={52}
              autoComplete="off"
              value={String(frequency.interval)}
              placeholder={showHints && index === 0 ? '1' : undefined}
              helpText={
                showHints && index === 0
                  ? 'How often orders repeat (1–52)'
                  : undefined
              }
              onChange={(value) =>
                updateFrequency(index, {
                  interval: Math.min(52, Math.max(1, Number(value) || 1)),
                })
              }
            />
            <Select
              label="Unit"
              options={UNIT_OPTIONS}
              value={frequency.unit}
              helpText={
                showHints && index === 0
                  ? 'Day, week, month, or year'
                  : undefined
              }
              onChange={(value) =>
                updateFrequency(index, { unit: value as FrequencyUnit })
              }
            />
            <TextField
              label="Discount %"
              type="number"
              min={0}
              max={100}
              autoComplete="off"
              value={String(frequency.discountPercent ?? 0)}
              placeholder={showHints && index === 0 ? '10' : undefined}
              helpText={
                showHints && index === 0
                  ? 'Optional extra discount for this frequency (0–100)'
                  : undefined
              }
              onChange={(value) =>
                updateFrequency(index, {
                  discountPercent: Math.min(
                    100,
                    Math.max(0, Number(value) || 0),
                  ),
                })
              }
            />
            {planType === 'prepaid' ? (
              <TextField
                label="Bill every (same unit)"
                type="number"
                min={frequency.interval}
                max={52}
                autoComplete="off"
                value={String(
                  frequency.prepaidBillingInterval ?? frequency.interval * 3,
                )}
                helpText={
                  showHints && index === 0
                    ? `Delivery every ${frequency.interval} ${frequency.unit}(s); charge upfront for this many ${frequency.unit}s`
                    : undefined
                }
                onChange={(value) =>
                  updateFrequency(index, {
                    prepaidBillingInterval: Math.min(
                      52,
                      Math.max(
                        frequency.interval,
                        Number(value) || frequency.interval,
                      ),
                    ),
                  })
                }
              />
            ) : null}
          </FormLayout.Group>
          <InlineStack align="end">
            <Button
              tone="critical"
              variant="plain"
              disabled={frequencies.length === 1}
              onClick={() => removeFrequency(index)}
            >
              Remove
            </Button>
          </InlineStack>
        </FormLayout>
      ))}
      <Button onClick={addFrequency}>Add frequency</Button>
    </BlockStack>
  );
}
