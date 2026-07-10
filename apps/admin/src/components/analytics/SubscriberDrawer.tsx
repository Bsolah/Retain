import {
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useState } from 'react';
import {
  useAddNote,
  useCreateIntervention,
  useSubscriberDetail,
} from '../../hooks/useAnalytics';
import type { SubscriberDetail } from '../../types/analytics';
import { BillingCountdown, formatPreciseDateTime } from './BillingCountdown';

function chargeStatusTone(
  status: SubscriberDetail['chargeStatus'],
): 'success' | 'warning' | 'critical' | 'info' | undefined {
  switch (status) {
    case 'scheduled':
      return 'info';
    case 'pending_payment':
      return 'warning';
    case 'due':
      return 'warning';
    case 'overdue':
    case 'payment_failed':
      return 'critical';
    case 'paused':
      return 'warning';
    default:
      return undefined;
  }
}

function formatChargeStatus(status: SubscriberDetail['chargeStatus']): string {
  return status.replace(/_/g, ' ');
}

function paymentStatusTone(
  status: string,
): 'success' | 'warning' | 'critical' | 'info' | undefined {
  if (status === 'paid' || status === 'success' || status === 'fulfilled') {
    return 'success';
  }
  if (status === 'scheduled') {
    return 'info';
  }
  if (status === 'failed' || status === 'payment_failed') {
    return 'critical';
  }
  return 'warning';
}

function formatPaymentStatus(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'pending':
      return 'Pending';
    case 'scheduled':
      return 'Scheduled';
    case 'failed':
    case 'payment_failed':
      return 'Failed';
    case 'success':
      return 'Success';
    default:
      return status.replace(/_/g, ' ');
  }
}

function formatPaymentLabel(
  payment: SubscriberDetail['paymentHistory'][number],
): string {
  if (payment.kind === 'order') {
    return `Order ${payment.orderNumber ?? '—'}`;
  }
  return 'Billing attempt';
}

export function SubscriberDrawer({
  contractId,
  onClose,
}: {
  contractId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useSubscriberDetail(contractId);
  const addNote = useAddNote(contractId ?? '');
  const createIntervention = useCreateIntervention(contractId ?? '');
  const [note, setNote] = useState('');
  const [offerSubject, setOfferSubject] = useState('Custom retention offer');

  if (!contractId) return null;

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          zIndex: 500,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(560px, 100vw)',
          height: '100vh',
          background: '#fff',
          boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.12)',
          zIndex: 501,
          overflowY: 'auto',
          padding: 20,
        }}
      >
        <BlockStack gap="400">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text as="h2" variant="headingLg">
              Subscriber
            </Text>
            <Button variant="plain" onClick={onClose}>
              Close
            </Button>
          </div>

          {isLoading || !data ? (
            <Spinner accessibilityLabel="Loading subscriber" />
          ) : (
            <>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    {data.customer.firstName} {data.customer.lastName}
                  </Text>
                  <Text as="p">{data.customer.email}</Text>
                  <Text as="p">
                    {data.customer.phone ?? 'No phone on file'}
                  </Text>
                  <Text as="p" tone="subdued">
                    {data.customer.address ?? 'Address not synced from Shopify'}
                  </Text>
                  <Text as="p">
                    LTV ${data.customer.lifetimeValue.toFixed(2)} · Tenure{' '}
                    {data.tenureDays} days · {data.frequency}
                  </Text>
                  <Badge>{data.status}</Badge>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h4" variant="headingSm">
                    Subscription
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {data.subscription.planName} · {data.subscription.planType}
                  </Text>
                  <Text as="p" variant="bodySm">
                    Billing {data.subscription.billingFrequency} · Delivery{' '}
                    {data.subscription.deliveryFrequency}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Shopify contract {data.shopifyContractId.split('/').pop()}
                  </Text>

                  <Divider />

                  <Text as="p" variant="headingSm">
                    Subscribed products
                  </Text>
                  {data.subscription.products.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No line items synced yet.
                    </Text>
                  ) : (
                    data.subscription.products.map((product, index) => (
                      <div
                        key={`${product.productId ?? 'item'}-${index}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <Text as="p" fontWeight="semibold">
                            {product.title}
                          </Text>
                          {product.variantId ? (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Variant {product.variantId.split('/').pop()}
                            </Text>
                          ) : null}
                        </div>
                        <BlockStack gap="050">
                          <Text as="p" alignment="end">
                            Qty {product.quantity}
                          </Text>
                          {product.unitPrice != null ? (
                            <Text as="p" variant="bodySm" tone="subdued">
                              ${product.unitPrice.toFixed(2)} each
                            </Text>
                          ) : null}
                        </BlockStack>
                      </div>
                    ))
                  )}

                  <Divider />

                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={chargeStatusTone(data.chargeStatus)}>
                      {formatChargeStatus(data.chargeStatus)}
                    </Badge>
                    {data.lastChargeTaken ? (
                      <Badge tone="success">Last charge taken</Badge>
                    ) : null}
                  </InlineStack>

                  <BillingCountdown
                    targetIso={
                      data.chargeStatus === 'payment_failed' &&
                      data.automaticRetries.nextRetryAt
                        ? data.automaticRetries.nextRetryAt
                        : data.chargeStatus === 'pending_payment'
                          ? null
                          : data.nextBillingDate
                    }
                    chargeStatus={data.chargeStatus}
                  />
                  {data.chargeStatus !== 'pending_payment' ? (
                    <Text as="p" variant="bodySm">
                      Next charge at{' '}
                      {formatPreciseDateTime(data.nextBillingDate)}
                    </Text>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Next charge will be scheduled after the initial payment is
                      received.
                    </Text>
                  )}
                  {data.lastBillingDate ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Last billed {formatPreciseDateTime(data.lastBillingDate)}
                      {data.latestOrder
                        ? ` · Order ${data.latestOrder.orderNumber}`
                        : ''}
                    </Text>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No successful charges recorded yet.
                    </Text>
                  )}
                  <Text as="p" variant="bodySm" tone="subdued">
                    {data.totalCharges} charge
                    {data.totalCharges === 1 ? '' : 's'} · $
                    {data.totalRevenue.toFixed(2)} lifetime on this contract
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h4" variant="headingSm">
                    Payment history
                  </Text>
                  {data.paymentHistory.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No successful payments yet.
                    </Text>
                  ) : (
                    data.paymentHistory.map((payment) => (
                      <PaymentHistoryRow key={payment.id} payment={payment} />
                    ))
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h4" variant="headingSm">
                      Automatic retries
                    </Text>
                    <Badge
                      tone={
                        data.automaticRetries.enabled ? 'success' : undefined
                      }
                    >
                      {data.automaticRetries.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Failed payments trigger an automated dunning schedule with
                    card retries on days 1, 3, 7, and 14.
                  </Text>
                  {data.automaticRetries.active ? (
                    <>
                      <Text as="p" variant="bodySm">
                        Active campaign since{' '}
                        {formatPreciseDateTime(data.automaticRetries.startedAt)}
                      </Text>
                      <Text as="p" variant="bodySm">
                        Failure code:{' '}
                        {data.automaticRetries.failureCode ?? 'unknown'} ·{' '}
                        {data.automaticRetries.paymentFailureCount} failure
                        {data.automaticRetries.paymentFailureCount === 1
                          ? ''
                          : 's'}{' '}
                        (30d)
                      </Text>
                      {data.automaticRetries.nextRetryAt ? (
                        <Text as="p" variant="bodySm">
                          Next retry at{' '}
                          {formatPreciseDateTime(
                            data.automaticRetries.nextRetryAt,
                          )}
                        </Text>
                      ) : null}
                      <Text as="p" variant="bodySm" tone="subdued">
                        Completed steps:{' '}
                        {data.automaticRetries.completedSteps.length > 0
                          ? data.automaticRetries.completedSteps
                              .map((day) => `day ${day}`)
                              .join(', ')
                          : 'none yet'}
                      </Text>
                    </>
                  ) : (
                    <Text as="p" tone="subdued">
                      No active retry campaign. Retries will start automatically
                      if a charge fails.
                    </Text>
                  )}
                  <Divider />
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Retry schedule
                  </Text>
                  {data.automaticRetries.schedule.map((step) => (
                    <Text as="p" key={step.day} variant="bodySm">
                      Day {step.day}: {step.channels.join(', ')}
                      {step.retry ? ' · auto-retry billing' : ''}
                    </Text>
                  ))}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">
                    Risk factors
                  </Text>
                  {data.riskFactors.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No feature signals yet.
                    </Text>
                  ) : (
                    data.riskFactors.map((factor) => (
                      <div key={factor.feature}>
                        <Text as="p" variant="bodySm">
                          {factor.feature}
                        </Text>
                        <div
                          style={{
                            height: 6,
                            background: '#e2e8f0',
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${factor.contribution * 100}%`,
                              height: '100%',
                              background:
                                factor.contribution > 0.6
                                  ? '#dc2626'
                                  : '#d97706',
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">
                    Subscription timeline
                  </Text>
                  <div
                    style={{
                      borderLeft: '2px solid #e2e8f0',
                      marginLeft: 8,
                      paddingLeft: 16,
                    }}
                  >
                    {data.timeline.slice(0, 25).map((event) => (
                      <div key={event.id} style={{ marginBottom: 12 }}>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {new Date(event.createdAt).toLocaleString()}
                        </Text>
                        <Text as="p">
                          {event.type}
                          {event.subtype ? ` · ${event.subtype}` : ''}
                        </Text>
                      </div>
                    ))}
                  </div>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">
                    Interventions
                  </Text>
                  {data.interventions.map((item) => (
                    <Text as="p" key={item.id}>
                      {item.type} · {item.status}
                      {item.outcome ? ` · ${item.outcome}` : ''}
                      {item.revenueImpact != null
                        ? ` · $${item.revenueImpact.toFixed(0)}`
                        : ''}
                    </Text>
                  ))}
                  <TextField
                    label="Manual offer subject"
                    autoComplete="off"
                    value={offerSubject}
                    onChange={setOfferSubject}
                  />
                  <Button
                    onClick={() =>
                      createIntervention.mutate({
                        interventionType: 'discount_offer',
                        subject: offerSubject,
                        body: 'Merchant-created retention offer',
                      })
                    }
                    loading={createIntervention.isPending}
                  >
                    Create manual intervention
                  </Button>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">
                    Notes
                  </Text>
                  {data.notes.map((item) => (
                    <Text as="p" key={item.id}>
                      {new Date(item.createdAt).toLocaleString()}: {item.note}
                    </Text>
                  ))}
                  <TextField
                    label="Add note"
                    autoComplete="off"
                    value={note}
                    onChange={setNote}
                    multiline={3}
                  />
                  <Button
                    onClick={() => {
                      if (!note.trim()) return;
                      addNote.mutate(note, { onSuccess: () => setNote('') });
                    }}
                    loading={addNote.isPending}
                  >
                    Save note
                  </Button>
                </BlockStack>
              </Card>
            </>
          )}
        </BlockStack>
      </div>
    </>
  );
}

function PaymentHistoryRow({
  payment,
}: {
  payment: SubscriberDetail['paymentHistory'][number];
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #f1f5f9',
      }}
    >
      <BlockStack gap="050">
        <Text as="p" fontWeight="semibold">
          {formatPaymentLabel(payment)}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {formatPreciseDateTime(payment.createdAt)}
          {payment.billingCycle != null
            ? ` · Cycle ${payment.billingCycle}`
            : ''}
          {payment.detail ? ` · ${payment.detail}` : ''}
        </Text>
      </BlockStack>
      <BlockStack gap="050">
        <Badge tone={paymentStatusTone(payment.status)}>
          {formatPaymentStatus(payment.status)}
        </Badge>
        <Text as="p" alignment="end">
          {payment.currency} {payment.amount.toFixed(2)}
        </Text>
      </BlockStack>
    </div>
  );
}
