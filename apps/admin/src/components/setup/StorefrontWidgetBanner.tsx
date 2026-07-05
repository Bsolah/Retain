import { useState } from 'react';
import {
  Banner,
  BlockStack,
  Button,
  InlineStack,
  Text,
} from '@shopify/polaris';
import {
  useStorefrontWidget,
  type StorefrontWidgetSource,
} from '../../hooks/useStorefrontWidget';

type StorefrontWidgetBannerProps = {
  /** Show even when status is unknown (e.g. missing read_themes scope). */
  showWhenUnknown?: boolean;
  /** Emphasize the setup CTA after creating a plan. */
  prominent?: boolean;
};

function activeTitle(source?: StorefrontWidgetSource | null): string {
  if (source === 'theme_native') {
    return 'Your theme already shows subscription options';
  }
  return 'Storefront subscribe button is active';
}

function activeMessage(
  themeName?: string | null,
  source?: StorefrontWidgetSource | null,
): string {
  const themeSuffix = themeName ? ` (${themeName})` : '';

  if (source === 'theme_native') {
    return `Customers can subscribe using your theme's built-in purchase options${themeSuffix}. You do not need to add Retain's theme block.`;
  }

  return `Customers can choose subscription options on product pages${themeSuffix}.`;
}

export function StorefrontWidgetBanner({
  showWhenUnknown = false,
  prominent = false,
}: StorefrontWidgetBannerProps) {
  const { data, isLoading, refetch, isFetching } = useStorefrontWidget();
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  if (isLoading || !data) {
    return null;
  }

  async function handleCheckAgain() {
    setCheckMessage(null);
    const result = await refetch();
    const widget = result.data;

    if (widget?.status === 'active') {
      return;
    }

    if (widget?.status === 'unknown') {
      setCheckMessage(
        'Could not read your theme. Reinstall the app to grant theme access, then try again.',
      );
      return;
    }

    setCheckMessage(
      'Subscribe options not detected yet. Save your theme in the editor, wait a few seconds, then check again.',
    );
  }

  if (data.status === 'active') {
    return (
      <Banner tone="success" title={activeTitle(data.source)}>
        <p>{activeMessage(data.themeName, data.source)}</p>
      </Banner>
    );
  }

  if (data.status === 'unknown' && !showWhenUnknown) {
    return null;
  }

  const tone = prominent ? 'warning' : 'info';
  const title =
    data.status === 'unknown'
      ? 'Enable the subscribe button on your storefront'
      : 'Customers cannot subscribe yet';

  return (
    <Banner
      tone={tone}
      title={title}
      action={{
        content: 'Open theme editor',
        url: data.deepLinkUrl,
        external: true,
      }}
      secondaryAction={{
        content: isFetching ? 'Checking…' : 'Check again',
        onAction: () => void handleCheckAgain(),
      }}
    >
      <BlockStack gap="200">
        <Text as="p">
          Your plans are synced to Shopify. If your theme already shows
          subscription options on product pages, you are all set. Otherwise, add
          Retain&apos;s <strong>Subscribe</strong> block above Buy buttons.
        </Text>
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" tone="subdued">
            1. Click <strong>Open theme editor</strong>
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            2. Place the <strong>Retain: Subscribe</strong> block above Buy
            buttons
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            3. Click <strong>Save</strong> in the top-right corner, then{' '}
            <strong>Check again</strong>
          </Text>
        </BlockStack>
        {checkMessage ? (
          <Text as="p" variant="bodySm" tone="subdued">
            {checkMessage}
          </Text>
        ) : null}
        {data.status === 'unknown' ? (
          <Text as="p" variant="bodySm" tone="subdued">
            If this keeps showing, reinstall the app to grant theme access
            (read_themes scope).
          </Text>
        ) : null}
      </BlockStack>
    </Banner>
  );
}

type StorefrontSetupModalProps = {
  open: boolean;
  onClose: () => void;
};

export function StorefrontSetupModal({
  open,
  onClose,
}: StorefrontSetupModalProps) {
  const { data } = useStorefrontWidget();

  if (!open || !data) return null;

  if (data.status === 'active') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'var(--p-color-bg-surface)',
            borderRadius: '12px',
            maxWidth: '520px',
            width: '100%',
            padding: '1.5rem',
            boxShadow: 'var(--p-shadow-600)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <StorefrontWidgetBanner />
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--p-color-bg-surface)',
          borderRadius: '12px',
          maxWidth: '520px',
          width: '100%',
          padding: '1.5rem',
          boxShadow: 'var(--p-shadow-600)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              One more step: enable subscribe on your store
            </Text>
            <Text as="p" tone="subdued">
              Your plan is live in Shopify. Turn on the storefront widget so
              customers can choose a subscription at checkout.
            </Text>
          </BlockStack>
          <StorefrontWidgetBanner prominent showWhenUnknown />
          <InlineStack align="end" gap="200">
            <Button onClick={onClose}>Done for now</Button>
            <Button variant="primary" url={data.deepLinkUrl} external>
              Open theme editor
            </Button>
          </InlineStack>
        </BlockStack>
      </div>
    </div>
  );
}
