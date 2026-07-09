import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  fetchSupportContext,
  submitSupportRequest,
  type SupportCategory,
} from '../lib/support-api';

const CATEGORY_OPTIONS: Array<{ label: string; value: SupportCategory }> = [
  { label: 'Bug or something broken', value: 'bug' },
  { label: 'Question about how Retain works', value: 'question' },
  { label: 'Feature request', value: 'feature' },
  { label: 'Billing or account', value: 'billing' },
  { label: 'Something else', value: 'other' },
];

export function SupportPage() {
  const { data: context, isLoading } = useQuery({
    queryKey: ['support-context'],
    queryFn: fetchSupportContext,
  });

  const [category, setCategory] = useState<SupportCategory>('question');
  const [replyEmail, setReplyEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (context?.replyEmail && !replyEmail) {
      setReplyEmail(context.replyEmail);
    }
  }, [context?.replyEmail, replyEmail]);

  const mutation = useMutation({
    mutationFn: submitSupportRequest,
    onSuccess: () => {
      setSubmitted(true);
      setMessage('');
      setSubject('');
    },
  });

  const mailtoHref =
    context?.inboxEmail != null
      ? `mailto:${encodeURIComponent(context.inboxEmail)}?subject=${encodeURIComponent(
          `Retain support — ${context.shopDomain}`,
        )}`
      : null;

  return (
    <Page
      title="Support"
      subtitle="Report a bug, ask a question, or request a call — we typically reply within one business day."
    >
      <BlockStack gap="400">
        {submitted ? (
          <Banner
            tone="success"
            title="Message sent"
            onDismiss={() => setSubmitted(false)}
          >
            <p>
              Thanks — we received your message
              {mutation.data?.dryRun
                ? ' (saved locally in development; configure SUPPORT_INBOX_EMAIL and SendGrid in production to receive emails)'
                : ' and will reply to your email soon'}
              .
            </p>
          </Banner>
        ) : null}

        {mutation.isError ? (
          <Banner tone="critical" title="Could not send message">
            <p>
              {mutation.error instanceof Error
                ? mutation.error.message
                : 'Please try again or email us directly.'}
            </p>
          </Banner>
        ) : null}

        <InlineStack gap="400" align="start" wrap={false}>
          <div style={{ flex: '2 1 420px', minWidth: 0 }}>
            <Card>
              {isLoading ? (
                <Spinner accessibilityLabel="Loading support form" />
              ) : (
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Send us a message
                  </Text>
                  <FormLayout>
                    <Select
                      label="What do you need help with?"
                      options={CATEGORY_OPTIONS}
                      value={category}
                      onChange={(value) =>
                        setCategory(value as SupportCategory)
                      }
                    />
                    <TextField
                      label="Your email"
                      type="email"
                      autoComplete="email"
                      value={replyEmail}
                      onChange={setReplyEmail}
                      helpText="We will reply to this address."
                    />
                    <TextField
                      label="Subject (optional)"
                      autoComplete="off"
                      value={subject}
                      onChange={setSubject}
                      placeholder="Short summary of your request"
                    />
                    <TextField
                      label="Message"
                      value={message}
                      onChange={setMessage}
                      multiline={6}
                      autoComplete="off"
                      helpText="Include steps to reproduce for bugs, or links/screenshots if helpful."
                    />
                  </FormLayout>
                  <Button
                    variant="primary"
                    loading={mutation.isPending}
                    disabled={!message.trim() || !replyEmail.trim()}
                    onClick={() =>
                      mutation.mutate({
                        category,
                        message,
                        replyEmail,
                        subject: subject.trim() || undefined,
                        pageUrl: window.location.href,
                      })
                    }
                  >
                    Send message
                  </Button>
                </BlockStack>
              )}
            </Card>
          </div>

          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Other ways to reach us
                  </Text>
                  {context?.inboxEmail ? (
                    <BlockStack gap="100">
                      <Text as="p" tone="subdued">
                        Email
                      </Text>
                      <Text as="p" fontWeight="semibold">
                        {context.inboxEmail}
                      </Text>
                      {mailtoHref ? (
                        <Button url={mailtoHref} external>
                          Open in email app
                        </Button>
                      ) : null}
                    </BlockStack>
                  ) : (
                    <Text as="p" tone="subdued">
                      Use the form to contact the Retain team. Your shop domain
                      is attached automatically.
                    </Text>
                  )}
                  {context?.bookingUrl ? (
                    <Button url={context.bookingUrl} external>
                      Book a call
                    </Button>
                  ) : null}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Tips for faster help
                  </Text>
                  <Text as="p" tone="subdued">
                    Mention the page you were on, your subscription plan name,
                    and any error messages you saw. For storefront issues,
                    include your theme name.
                  </Text>
                  {context?.shopDomain ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Shop: {context.shopName} ({context.shopDomain})
                    </Text>
                  ) : null}
                </BlockStack>
              </Card>
            </BlockStack>
          </div>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
