import {
  BlockStack,
  Button,
  Checkbox,
  FormLayout,
  InlineStack,
  Text,
  TextField,
} from '@shopify/polaris';
import { usePlanWizardStore } from '../../stores/plan-wizard';

type BoxConfigBuilderProps = {
  showHints?: boolean;
};

export function BoxConfigBuilder({ showHints = false }: BoxConfigBuilderProps) {
  const boxConfig = usePlanWizardStore((state) => state.boxConfig);
  const setBoxConfig = usePlanWizardStore((state) => state.setBoxConfig);
  const addBoxSlot = usePlanWizardStore((state) => state.addBoxSlot);
  const updateBoxSlot = usePlanWizardStore((state) => state.updateBoxSlot);
  const removeBoxSlot = usePlanWizardStore((state) => state.removeBoxSlot);

  if (!boxConfig) return null;

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h3" variant="headingMd">
          Box configuration
        </Text>
        {showHints ? (
          <Text as="p" tone="subdued">
            Customers pick items from your product pool to fill each slot in
            their box. Set how many items are required and whether swaps are
            allowed.
          </Text>
        ) : null}
      </BlockStack>

      <FormLayout>
        <FormLayout.Group>
          <TextField
            label="Minimum items"
            type="number"
            min={1}
            max={20}
            autoComplete="off"
            value={String(boxConfig.minItems)}
            helpText={
              showHints
                ? 'Minimum products a customer must include in the box'
                : undefined
            }
            onChange={(value) =>
              setBoxConfig({
                minItems: Math.min(20, Math.max(1, Number(value) || 1)),
              })
            }
          />
          <TextField
            label="Maximum items"
            type="number"
            min={boxConfig.minItems}
            max={20}
            autoComplete="off"
            value={String(boxConfig.maxItems)}
            helpText={
              showHints
                ? 'Maximum products allowed in one box (up to 20)'
                : undefined
            }
            onChange={(value) =>
              setBoxConfig({
                maxItems: Math.min(
                  20,
                  Math.max(
                    boxConfig.minItems,
                    Number(value) || boxConfig.minItems,
                  ),
                ),
              })
            }
          />
        </FormLayout.Group>
        <Checkbox
          label="Allow product swaps between deliveries"
          checked={boxConfig.allowSwaps}
          helpText={
            showHints
              ? 'When enabled, customers can change box contents before each shipment'
              : undefined
          }
          onChange={(checked) => setBoxConfig({ allowSwaps: checked })}
        />
      </FormLayout>

      <BlockStack gap="200">
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          Box slots
        </Text>
        {showHints ? (
          <Text as="p" tone="subdued">
            Optional named slots (e.g. &quot;Snack&quot;, &quot;Drink&quot;).
            Leave empty to auto-generate from minimum items.
          </Text>
        ) : null}
        {boxConfig.slots.map((slot, index) => (
          <FormLayout key={slot.id}>
            <FormLayout.Group>
              <TextField
                label="Slot label"
                autoComplete="off"
                value={slot.label ?? ''}
                placeholder={`Item ${index + 1}`}
                onChange={(value) =>
                  updateBoxSlot(index, { label: value || null })
                }
              />
              <Checkbox
                label="Required"
                checked={slot.required}
                onChange={(checked) =>
                  updateBoxSlot(index, { required: checked })
                }
              />
            </FormLayout.Group>
            <InlineStack align="end">
              <Button
                tone="critical"
                variant="plain"
                onClick={() => removeBoxSlot(index)}
              >
                Remove slot
              </Button>
            </InlineStack>
          </FormLayout>
        ))}
        <Button
          onClick={addBoxSlot}
          disabled={boxConfig.slots.length >= boxConfig.maxItems}
        >
          Add slot
        </Button>
      </BlockStack>
    </BlockStack>
  );
}
