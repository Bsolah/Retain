import {
  Badge,
  BlockStack,
  Button,
  Card,
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
          width: 'min(480px, 100vw)',
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
