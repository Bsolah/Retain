import {
  Banner,
  BlockStack,
  Button,
  InlineStack,
  Link,
  Text,
  TextField,
} from '@shopify/polaris';
import { useCallback, useState } from 'react';

type PaymentLinkSuccessProps = {
  customerEmail: string;
  paymentLink: string;
  orderName: string | null;
  emailSent: boolean;
  onViewSubscribers: () => void;
  onCreateAnother: () => void;
};

export function PaymentLinkSuccess({
  customerEmail,
  paymentLink,
  orderName,
  emailSent,
  onViewSubscribers,
  onCreateAnother,
}: PaymentLinkSuccessProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [paymentLink]);

  return (
    <Banner
      tone="success"
      title={emailSent ? 'Payment link sent' : 'Payment link created'}
    >
      <BlockStack gap="300">
        <Text as="p">
          {emailSent ? (
            <>
              A payment email was sent to{' '}
              <Text as="span" fontWeight="semibold">
                {customerEmail}
              </Text>
              {orderName ? ` for order ${orderName}` : ''}.
            </>
          ) : (
            <>
              The subscription and unpaid order were created
              {orderName ? ` (${orderName})` : ''}. Share the payment link below
              with {customerEmail}.
            </>
          )}
        </Text>
        <TextField
          label="Payment link"
          value={paymentLink}
          readOnly
          autoComplete="off"
          connectedRight={
            <Button onClick={() => void copyLink()}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          }
        />
        <InlineStack gap="200">
          <Link url={paymentLink} target="_blank">
            Open payment link
          </Link>
        </InlineStack>
        <InlineStack gap="200">
          <Button onClick={onViewSubscribers}>View subscribers</Button>
          <Button variant="plain" onClick={onCreateAnother}>
            Create another subscription
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
