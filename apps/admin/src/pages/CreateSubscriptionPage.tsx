import {
  Banner,
  BlockStack,
  Checkbox,
  ChoiceList,
  FormLayout,
  Page,
  Select,
  Spinner,
  TextField,
} from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormSection } from '../components/subscriptions/FormSection';
import { OrderSummary } from '../components/subscriptions/OrderSummary';
import { PaymentLinkSuccess } from '../components/subscriptions/PaymentLinkSuccess';
import { ProductLineSelector } from '../components/subscriptions/ProductLineSelector';
import {
  useCreateManualSubscription,
  useManualSubscriptionCustomerLookup,
} from '../hooks/useManualSubscription';
import { usePlans } from '../hooks/usePlans';
import type { ManualSubscriptionLine } from '../lib/manual-subscription-api';

type AddressForm = {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
};

type PaymentMode = 'saved_card' | 'payment_link';
type PaymentLinkResult = {
  customerEmail: string;
  paymentLink: string;
  orderName: string | null;
  emailSent: boolean;
};
type SectionKey =
  'customer' | 'products' | 'plan' | 'billing' | 'shipping' | 'payment';

const emptyAddress = (): AddressForm => ({
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  country: 'United States',
  zip: '',
  phone: '',
});

const DEFAULT_OPEN_SECTIONS: Record<SectionKey, boolean> = {
  customer: true,
  products: true,
  plan: true,
  billing: false,
  shipping: false,
  payment: true,
};

export function CreateSubscriptionPage() {
  const navigate = useNavigate();
  const { data: plans = [], isLoading: plansLoading } = usePlans();
  const createSubscription = useCreateManualSubscription();

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    DEFAULT_OPEN_SECTIONS,
  );

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [billingAddress, setBillingAddress] =
    useState<AddressForm>(emptyAddress);
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(true);
  const [shippingAddress, setShippingAddress] =
    useState<AddressForm>(emptyAddress);
  const [deliveryPrice, setDeliveryPrice] = useState('0');

  const [lines, setLines] = useState<ManualSubscriptionLine[]>([]);
  const [planId, setPlanId] = useState('');
  const [frequencyIndex, setFrequencyIndex] = useState('0');
  const [chargeTiming, setChargeTiming] = useState<'now' | 'future'>('now');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode[]>(['saved_card']);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [sendPaymentLinkEmail, setSendPaymentLinkEmail] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentLinkResult, setPaymentLinkResult] =
    useState<PaymentLinkResult | null>(null);

  const { data: customerLookup, isFetching: lookupLoading } =
    useManualSubscriptionCustomerLookup(email.trim());

  const selectablePlans = useMemo(
    () => plans.filter((plan) => plan.status !== 'archived'),
    [plans],
  );

  const selectedPlan = selectablePlans.find((plan) => plan.id === planId);
  const frequencyOptions = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.frequencies.map((frequency, index) => ({
      label: `Every ${frequency.interval} ${frequency.unit}${frequency.interval === 1 ? '' : 's'}`,
      value: String(index),
    }));
  }, [selectedPlan]);

  const selectedPaymentMode = paymentMode[0] ?? 'saved_card';

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0),
    [lines],
  );
  const parsedDeliveryPrice = useMemo(() => {
    const value = Number(deliveryPrice);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }, [deliveryPrice]);
  const orderTotal = subtotal + parsedDeliveryPrice;

  useEffect(() => {
    if (!customerLookup?.found || !customerLookup.customer) return;
    setFirstName((current) => customerLookup.customer!.firstName ?? current);
    setLastName((current) => customerLookup.customer!.lastName ?? current);
    setPhone((current) => customerLookup.customer!.phone ?? current);
    if (customerLookup.paymentMethods[0]) {
      setPaymentMethodId(
        (current) => current || customerLookup.paymentMethods[0]!.id,
      );
      setPaymentMode(['saved_card']);
    } else if (chargeTiming === 'now') {
      setPaymentMode(['payment_link']);
    }
  }, [chargeTiming, customerLookup]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleSubmit = async () => {
    setFormError(null);
    setPaymentLinkResult(null);

    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      setFormError('Customer name and email are required.');
      return;
    }
    if (!planId) {
      setFormError('Select a subscription plan.');
      return;
    }
    if (lines.length === 0) {
      setFormError('Add at least one product.');
      return;
    }
    if (!billingAddress.address1.trim() || !billingAddress.city.trim()) {
      setFormError('Billing address is required.');
      return;
    }
    if (chargeTiming === 'future' && !nextBillingDate) {
      setFormError('Choose a future billing date.');
      return;
    }
    if (
      chargeTiming === 'now' &&
      selectedPaymentMode === 'saved_card' &&
      !paymentMethodId
    ) {
      setFormError(
        'Select a saved payment method or choose to send a payment link.',
      );
      return;
    }

    try {
      const result = await createSubscription.mutateAsync({
        customer: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
        },
        billingAddress: {
          ...billingAddress,
          phone: billingAddress.phone || phone || undefined,
        },
        shippingSameAsBilling,
        shippingAddress: shippingSameAsBilling ? undefined : shippingAddress,
        planId,
        frequencyIndex: Number(frequencyIndex),
        lines,
        chargeTiming,
        nextBillingDate:
          chargeTiming === 'future'
            ? new Date(nextBillingDate).toISOString()
            : undefined,
        paymentMode: chargeTiming === 'now' ? selectedPaymentMode : undefined,
        paymentMethodId:
          chargeTiming === 'now' && selectedPaymentMode === 'saved_card'
            ? paymentMethodId
            : undefined,
        sendPaymentLinkEmail:
          chargeTiming === 'now' &&
          selectedPaymentMode === 'payment_link' &&
          sendPaymentLinkEmail,
        deliveryPrice: parsedDeliveryPrice,
      });

      if (
        chargeTiming === 'now' &&
        selectedPaymentMode === 'payment_link' &&
        result.paymentLink
      ) {
        setPaymentLinkResult({
          customerEmail: email.trim(),
          paymentLink: result.paymentLink,
          orderName: result.shopifyOrderName,
          emailSent: result.paymentEmailSent,
        });
        return;
      }

      navigate('/subscribers', {
        state: {
          createdContractId: result.contractId,
          shopifyOrderName: result.shopifyOrderName,
        },
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Failed to create subscription',
      );
    }
  };

  const primaryActionLabel =
    chargeTiming === 'future'
      ? 'Schedule subscription'
      : selectedPaymentMode === 'payment_link'
        ? 'Create and send payment link'
        : 'Create and charge';

  return (
    <Page
      title="Create subscription"
      backAction={{
        content: 'Subscribers',
        onAction: () => navigate('/subscribers'),
      }}
      primaryAction={
        paymentLinkResult
          ? undefined
          : {
              content: primaryActionLabel,
              onAction: () => void handleSubmit(),
              loading: createSubscription.isPending,
            }
      }
    >
      <BlockStack gap="400">
        {paymentLinkResult ? (
          <PaymentLinkSuccess
            customerEmail={paymentLinkResult.customerEmail}
            paymentLink={paymentLinkResult.paymentLink}
            orderName={paymentLinkResult.orderName}
            emailSent={paymentLinkResult.emailSent}
            onViewSubscribers={() => navigate('/subscribers')}
            onCreateAnother={() => {
              setPaymentLinkResult(null);
              setFormError(null);
            }}
          />
        ) : null}

        {formError ? (
          <Banner tone="critical" title="Could not create subscription">
            <p>{formError}</p>
          </Banner>
        ) : null}

        <FormSection
          id="customer-section"
          title="Customer"
          open={openSections.customer}
          onToggle={() => toggleSection('customer')}
          summary={email.trim() || undefined}
        >
          <FormLayout>
            <FormLayout.Group>
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
              />
              <TextField
                label="Phone"
                autoComplete="tel"
                value={phone}
                onChange={setPhone}
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField
                label="First name"
                autoComplete="given-name"
                value={firstName}
                onChange={setFirstName}
              />
              <TextField
                label="Last name"
                autoComplete="family-name"
                value={lastName}
                onChange={setLastName}
              />
            </FormLayout.Group>
          </FormLayout>
          {lookupLoading ? <Spinner size="small" /> : null}
          {customerLookup?.found ? (
            <Banner tone="info">
              Existing Shopify customer found
              {customerLookup.paymentMethods.length > 0
                ? ` · ${customerLookup.paymentMethods.length} saved payment method(s)`
                : ' · no saved payment methods yet'}
            </Banner>
          ) : null}
        </FormSection>

        <FormSection
          id="products-section"
          title="Products"
          open={openSections.products}
          onToggle={() => toggleSection('products')}
          summary={
            lines.length > 0
              ? `${lines.length} product${lines.length === 1 ? '' : 's'}`
              : undefined
          }
        >
          <ProductLineSelector lines={lines} onLinesChange={setLines} />
        </FormSection>

        <FormSection
          id="plan-section"
          title="Plan and billing cycle"
          open={openSections.plan}
          onToggle={() => toggleSection('plan')}
          summary={selectedPlan?.name}
        >
          {plansLoading ? <Spinner size="small" /> : null}
          <FormLayout>
            <Select
              label="Subscription plan"
              options={[
                { label: 'Select a plan', value: '' },
                ...selectablePlans.map((plan) => ({
                  label: `${plan.name}${plan.status === 'paused' ? ' (paused)' : ''}`,
                  value: plan.id,
                })),
              ]}
              value={planId}
              onChange={(value) => {
                setPlanId(value);
                setFrequencyIndex('0');
              }}
            />
            {planId ? (
              <Select
                label="Billing frequency"
                options={frequencyOptions}
                value={frequencyIndex}
                onChange={setFrequencyIndex}
              />
            ) : null}
            <Select
              label="When to charge"
              options={[
                { label: 'Charge now', value: 'now' },
                { label: 'Schedule for future date', value: 'future' },
              ]}
              value={chargeTiming}
              onChange={(value) => setChargeTiming(value as 'now' | 'future')}
            />
            {chargeTiming === 'future' ? (
              <TextField
                label="First billing date"
                type="datetime-local"
                autoComplete="off"
                value={nextBillingDate}
                onChange={setNextBillingDate}
              />
            ) : null}
          </FormLayout>
        </FormSection>

        <FormSection
          id="billing-section"
          title="Billing address"
          open={openSections.billing}
          onToggle={() => toggleSection('billing')}
          summary={billingAddress.city || undefined}
        >
          <FormLayout>
            <FormLayout.Group>
              <TextField
                label="First name"
                value={billingAddress.firstName}
                onChange={(value) =>
                  setBillingAddress((current) => ({
                    ...current,
                    firstName: value,
                  }))
                }
                autoComplete="given-name"
              />
              <TextField
                label="Last name"
                value={billingAddress.lastName}
                onChange={(value) =>
                  setBillingAddress((current) => ({
                    ...current,
                    lastName: value,
                  }))
                }
                autoComplete="family-name"
              />
            </FormLayout.Group>
            <TextField
              label="Address"
              value={billingAddress.address1}
              onChange={(value) =>
                setBillingAddress((current) => ({
                  ...current,
                  address1: value,
                }))
              }
              autoComplete="address-line1"
            />
            <TextField
              label="Apartment, suite, etc."
              value={billingAddress.address2}
              onChange={(value) =>
                setBillingAddress((current) => ({
                  ...current,
                  address2: value,
                }))
              }
              autoComplete="address-line2"
            />
            <FormLayout.Group>
              <TextField
                label="City"
                value={billingAddress.city}
                onChange={(value) =>
                  setBillingAddress((current) => ({
                    ...current,
                    city: value,
                  }))
                }
                autoComplete="address-level2"
              />
              <TextField
                label="State / province"
                value={billingAddress.province}
                onChange={(value) =>
                  setBillingAddress((current) => ({
                    ...current,
                    province: value,
                  }))
                }
                autoComplete="address-level1"
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField
                label="ZIP / postal code"
                value={billingAddress.zip}
                onChange={(value) =>
                  setBillingAddress((current) => ({ ...current, zip: value }))
                }
                autoComplete="postal-code"
              />
              <TextField
                label="Country"
                value={billingAddress.country}
                onChange={(value) =>
                  setBillingAddress((current) => ({
                    ...current,
                    country: value,
                  }))
                }
                autoComplete="country-name"
              />
            </FormLayout.Group>
          </FormLayout>
        </FormSection>

        <FormSection
          id="shipping-section"
          title="Shipping and delivery"
          open={openSections.shipping}
          onToggle={() => toggleSection('shipping')}
          summary={
            orderTotal > 0
              ? `$${orderTotal.toFixed(2)} total`
              : shippingSameAsBilling
                ? 'Same as billing'
                : undefined
          }
        >
          <BlockStack gap="400">
            <Checkbox
              label="Same as billing address"
              checked={shippingSameAsBilling}
              onChange={setShippingSameAsBilling}
            />
            {!shippingSameAsBilling ? (
              <FormLayout>
                <TextField
                  label="Address"
                  value={shippingAddress.address1}
                  onChange={(value) =>
                    setShippingAddress((current) => ({
                      ...current,
                      address1: value,
                    }))
                  }
                  autoComplete="shipping address-line1"
                />
                <FormLayout.Group>
                  <TextField
                    label="City"
                    value={shippingAddress.city}
                    onChange={(value) =>
                      setShippingAddress((current) => ({
                        ...current,
                        city: value,
                      }))
                    }
                    autoComplete="shipping address-level2"
                  />
                  <TextField
                    label="ZIP"
                    value={shippingAddress.zip}
                    onChange={(value) =>
                      setShippingAddress((current) => ({
                        ...current,
                        zip: value,
                      }))
                    }
                    autoComplete="shipping postal-code"
                  />
                </FormLayout.Group>
              </FormLayout>
            ) : null}
            <TextField
              label="Delivery price"
              type="number"
              autoComplete="off"
              value={deliveryPrice}
              onChange={setDeliveryPrice}
              helpText="Shipping cost charged on each subscription renewal."
              prefix="$"
            />
            {lines.length > 0 ? (
              <OrderSummary
                subtotal={subtotal}
                deliveryPrice={parsedDeliveryPrice}
              />
            ) : null}
          </BlockStack>
        </FormSection>

        {chargeTiming === 'now' ? (
          <FormSection
            id="payment-section"
            title="Payment"
            open={openSections.payment}
            onToggle={() => toggleSection('payment')}
            summary={
              selectedPaymentMode === 'payment_link'
                ? 'Payment link'
                : 'Saved card'
            }
          >
            <BlockStack gap="300">
              <ChoiceList
                title="How should the customer pay?"
                choices={[
                  {
                    label: "Charge customer's saved card",
                    value: 'saved_card',
                    helpText:
                      'Uses a payment method already vaulted in Shopify for this customer.',
                  },
                  {
                    label: 'Send payment link',
                    value: 'payment_link',
                    helpText:
                      'Creates an unpaid Shopify order and emails the customer a secure payment link.',
                  },
                ]}
                selected={paymentMode}
                onChange={(value) => setPaymentMode(value as PaymentMode[])}
              />

              {selectedPaymentMode === 'saved_card' ? (
                customerLookup?.paymentMethods.length ? (
                  <Select
                    label="Saved payment method"
                    options={customerLookup.paymentMethods.map((method) => ({
                      label: `${method.brand} •••• ${method.lastDigits}${
                        method.expiryMonth && method.expiryYear
                          ? ` (${method.expiryMonth}/${method.expiryYear})`
                          : ''
                      }`,
                      value: method.id,
                    }))}
                    value={paymentMethodId}
                    onChange={setPaymentMethodId}
                  />
                ) : (
                  <Banner tone="warning">
                    No saved payment method for this customer. Enter their email
                    above to look up vaulted cards, or choose &quot;Send payment
                    link&quot; so they can pay securely via Shopify.
                  </Banner>
                )
              ) : (
                <BlockStack gap="200">
                  <Banner tone="info">
                    Shopify will create a normal order marked as unpaid. The
                    customer can complete payment through Shopify&apos;s hosted
                    checkout link.
                  </Banner>
                  <Checkbox
                    label="Email payment link to customer"
                    checked={sendPaymentLinkEmail}
                    onChange={setSendPaymentLinkEmail}
                  />
                </BlockStack>
              )}
            </BlockStack>
          </FormSection>
        ) : null}
      </BlockStack>
    </Page>
  );
}
