import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProductThumb } from '../components/ProductThumb';
import { SkeletonCards } from '../components/Skeleton';
import {
  useSubscription,
  useSubscriptionActions,
} from '../hooks/useSubscriptions';

function formatFrequency(frequency: unknown): string {
  if (!frequency || typeof frequency !== 'object') return 'Custom';
  const value = frequency as { interval?: string; intervalCount?: number };
  if (!value.interval) return 'Custom';
  const count = value.intervalCount ?? 1;
  const unit = value.interval.toLowerCase();
  return count === 1 ? `Every ${unit}` : `Every ${count} ${unit}s`;
}

export function SubscriptionDetailPage() {
  const { contractId = '' } = useParams();
  const { data, isLoading, isError, error, refetch } =
    useSubscription(contractId);
  const actions = useSubscriptionActions(contractId);
  const subscription = data?.subscription;

  const boxConfig = subscription?.boxConfig;
  const slotDefinitions = boxConfig?.slots ?? [];

  const boxItems = useMemo(() => {
    if (!Array.isArray(subscription?.boxItems)) return [];
    return subscription.boxItems as Array<{
      productId: string;
      variantId: string;
      quantity: number;
      slot?: string;
      price?: number;
    }>;
  }, [subscription?.boxItems]);

  const emptySlots = useMemo(() => {
    if (slotDefinitions.length > 0) {
      return slotDefinitions.map((slot) => ({
        productId: '',
        variantId: '',
        quantity: 1,
        slot: slot.id,
      }));
    }
    const count = boxConfig?.minItems ?? 1;
    return Array.from({ length: count }, (_, index) => ({
      productId: '',
      variantId: '',
      quantity: 1,
      slot: `slot-${index + 1}`,
    }));
  }, [slotDefinitions, boxConfig?.minItems]);

  const [slots, setSlots] = useState(boxItems);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addedAddOns, setAddedAddOns] = useState<string[]>([]);

  useEffect(() => {
    setSlots(boxItems.length > 0 ? boxItems : emptySlots);
  }, [boxItems, emptySlots]);

  if (isLoading) return <SkeletonCards count={4} />;

  if (isError || !subscription) {
    return (
      <div className="card error-card stack">
        <h2>Subscription unavailable</h2>
        <p className="muted">
          {error instanceof Error ? error.message : 'Not found'}
        </p>
        <button type="button" className="btn" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const address = subscription.shippingAddress as
    | {
        address1?: string;
        city?: string;
        province?: string;
        zip?: string;
        country?: string;
      }
    | null
    | undefined;

  const payment = subscription.paymentMethod;
  const unitPrice = subscription.unitPrice ?? 0;
  const addOnPrice = (subscription.addOns ?? [])
    .filter((item) => addedAddOns.includes(item.productId))
    .reduce((sum, item) => sum + (item.price ?? unitPrice), 0);
  const boxPrice =
    slots.reduce(
      (sum, item) => sum + (item.price ?? unitPrice) * (item.quantity || 1),
      0,
    ) || unitPrice;
  const liveTotal =
    subscription.planType === 'box'
      ? boxPrice + addOnPrice
      : unitPrice + addOnPrice;
  const currency = subscription.currencyCode ?? 'USD';

  return (
    <div className="stack">
      <Link to="/portal" className="muted">
        ← Back to dashboard
      </Link>

      <motion.section
        className="card stack"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <span className={`health ${subscription.health}`} />
            <ProductThumb
              name={subscription.productName ?? subscription.planName}
              imageUrl={subscription.imageUrl}
            />
            <div>
              <h1 style={{ margin: 0 }}>
                {subscription.productName ?? subscription.planName}
              </h1>
              <div className="muted">
                {subscription.planName} ·{' '}
                {formatFrequency(subscription.frequency)}
              </div>
            </div>
          </div>
          <span className={`badge ${subscription.status}`}>
            {subscription.status}
          </span>
        </div>
        <p className="muted">
          Next billing:{' '}
          {subscription.nextBillingDate
            ? new Date(subscription.nextBillingDate).toLocaleString()
            : '—'}
        </p>
        <div className="row">
          <button
            type="button"
            className="btn secondary"
            onClick={() => actions.pause.mutate(30)}
          >
            Pause
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => actions.skip.mutate()}
          >
            Skip next delivery
          </button>
          <Link className="btn danger" to={`/portal/${contractId}/cancel`}>
            Cancel
          </Link>
        </div>
      </motion.section>

      <div className="two-col">
        <section className="card stack">
          <h2>Shipping address</h2>
          {address ? (
            <p>
              {address.address1}
              <br />
              {address.city}, {address.province} {address.zip}
              <br />
              {address.country}
            </p>
          ) : (
            <p className="muted">No shipping address on file.</p>
          )}
          <Link className="btn secondary" to="/portal/manage">
            Update address
          </Link>
        </section>

        <section className="card stack">
          <h2>Payment method</h2>
          {payment ? (
            <p>
              {payment.brand} •••• {payment.last4}
              {payment.expiryMonth && payment.expiryYear
                ? ` · Exp ${String(payment.expiryMonth).padStart(2, '0')}/${String(payment.expiryYear).slice(-2)}`
                : null}
            </p>
          ) : (
            <p className="muted">Managed in your Shopify customer account.</p>
          )}
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              window.open(
                'https://shopify.com/account',
                '_blank',
                'noopener,noreferrer',
              )
            }
          >
            Update in Shopify
          </button>
        </section>
      </div>

      <section className="card stack">
        <h2>Order history</h2>
        {subscription.orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          subscription.orders.map((order) => (
            <div
              key={order.id}
              className="row"
              style={{ justifyContent: 'space-between' }}
            >
              <div>
                <strong>{order.orderNumber}</strong>
                <div className="muted">
                  {new Date(order.createdAt).toLocaleDateString()} ·{' '}
                  {order.status}
                </div>
              </div>
              <div>
                {order.currency} {order.totalPrice.toFixed(2)}
                {order.trackingNumber ? (
                  <div>
                    <a
                      href={`https://parcelsapp.com/en/tracking/${order.trackingNumber}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Track {order.trackingNumber}
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      {subscription.planType === 'box' ? (
        <section className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Box builder</h2>
            <strong>
              {currency} {liveTotal.toFixed(2)}
            </strong>
          </div>
          <p className="muted">
            {boxConfig?.allowSwaps === false
              ? 'Your box items are fixed for this plan.'
              : 'Drag slots to reorder and save before your next delivery.'}
            {boxConfig?.minItems != null && boxConfig?.maxItems != null
              ? ` Pick ${boxConfig.minItems}–${boxConfig.maxItems} items.`
              : null}
          </p>
          <div className="box-grid">
            {(slots.length > 0 ? slots : emptySlots).map((item, index) => {
              const slotDef = slotDefinitions.find(
                (slot) => slot.id === item.slot,
              );
              const slotLabel = slotDef?.label ?? `Slot ${index + 1}`;
              return (
                <div
                  key={`${item.slot ?? item.variantId}-${index}`}
                  className={`box-slot ${item.productId ? 'filled' : ''}`}
                  draggable={boxConfig?.allowSwaps !== false}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex == null || dragIndex === index) return;
                    const next = [...slots];
                    const [moved] = next.splice(dragIndex, 1);
                    if (!moved) return;
                    next.splice(index, 0, moved);
                    setSlots(next);
                    setDragIndex(null);
                  }}
                >
                  <strong>
                    {slotLabel}
                    {slotDef?.required ? ' *' : ''}
                  </strong>
                  <div className="muted">
                    {item.productId
                      ? item.variantId.split('/').pop()
                      : 'Choose a product'}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="btn"
            disabled={actions.updateBox.isPending}
            onClick={() => actions.updateBox.mutate(slots)}
          >
            Save box
          </button>
        </section>
      ) : null}

      <section className="card stack">
        <h2>Add-ons</h2>
        <p className="muted">
          Browse eligible products and add them to your next order.
        </p>
        {(subscription.addOns ?? []).length === 0 ? (
          <p className="muted">No eligible add-ons for this plan yet.</p>
        ) : (
          <div className="addon-grid">
            {(subscription.addOns ?? []).map((addon) => {
              const selected = addedAddOns.includes(addon.productId);
              return (
                <div key={addon.productId} className="card stack addon-card">
                  <ProductThumb name={addon.label} />
                  <strong>{addon.label}</strong>
                  <span className="muted">
                    {currency} {(addon.price ?? unitPrice).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    className={selected ? 'btn secondary' : 'btn'}
                    onClick={() =>
                      setAddedAddOns((current) =>
                        selected
                          ? current.filter((id) => id !== addon.productId)
                          : [...current, addon.productId],
                      )
                    }
                  >
                    {selected ? 'Remove' : 'Add to next order'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {addedAddOns.length > 0 ? (
          <p>
            Next order total estimate:{' '}
            <strong>
              {currency} {liveTotal.toFixed(2)}
            </strong>
          </p>
        ) : null}
      </section>
    </div>
  );
}
