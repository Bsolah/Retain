import { Button, ButtonGroup, InlineStack, TextField } from '@shopify/polaris';
import type { DateRangeKey } from '../../types/analytics';

const PRESETS: Array<{ id: DateRangeKey; label: string }> = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
];

export function DateRangeSelector({
  range,
  customStart,
  customEnd,
  onRangeChange,
  onCustomStartChange,
  onCustomEndChange,
}: {
  range: DateRangeKey;
  customStart: string;
  customEnd: string;
  onRangeChange: (range: DateRangeKey) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}) {
  return (
    <InlineStack gap="300" wrap blockAlign="end">
      <ButtonGroup variant="segmented">
        {PRESETS.map((item) => (
          <Button
            key={item.id}
            pressed={range === item.id}
            onClick={() => onRangeChange(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </ButtonGroup>
      {range === 'custom' ? (
        <InlineStack gap="200">
          <TextField
            label="Start"
            type="date"
            autoComplete="off"
            value={customStart}
            onChange={onCustomStartChange}
          />
          <TextField
            label="End"
            type="date"
            autoComplete="off"
            value={customEnd}
            onChange={onCustomEndChange}
          />
        </InlineStack>
      ) : null}
    </InlineStack>
  );
}
