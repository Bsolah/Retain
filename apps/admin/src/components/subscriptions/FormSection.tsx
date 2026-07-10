import {
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  InlineStack,
  Text,
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronUpIcon } from '@shopify/polaris-icons';
import type { ReactNode } from 'react';

type FormSectionProps = {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  summary?: string;
};

export function FormSection({
  id,
  title,
  open,
  onToggle,
  children,
  summary,
}: FormSectionProps) {
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Button
              variant="plain"
              onClick={onToggle}
              icon={open ? ChevronUpIcon : ChevronDownIcon}
              accessibilityLabel={
                open ? `Collapse ${title}` : `Expand ${title}`
              }
            />
            <Text as="h2" variant="headingMd">
              {title}
            </Text>
          </InlineStack>
          {!open && summary ? (
            <Text as="span" tone="subdued" variant="bodySm">
              {summary}
            </Text>
          ) : null}
        </InlineStack>
        <Collapsible
          open={open}
          id={id}
          transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
        >
          <Box paddingBlockStart="200">{children}</Box>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}
