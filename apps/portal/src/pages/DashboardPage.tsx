import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ProductThumb } from '../components/ProductThumb';
import { SkeletonCards } from '../components/Skeleton';
import {
  useSubscriptionActions,
  useSubscriptions,
} from '../hooks/useSubscriptions';
import type { PortalSubscription } from '../lib/api';

function formatFrequency(frequency?: PortalSubscription['frequency']): string {
  if (!frequency?.interval) return 'Custom cadence';
  const count = frequency.intervalCount ?? 1;
  const unit = frequency.interval.toLowerCase();
  return count === 1 ? `Every ${unit}` : `Every ${count} ${unit}s`;
}

function SubscriptionCard({
  subscription,
}: {
  subscription: PortalSubscription;
}) {
  const actions = useSubscriptionActions(subscription.id);
  const productName = subscription.productName ?? subscription.planName;
  const swapOptions = subscription.swapOptions ?? [];

  return (
    <motion.article
      className="card stack"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span
            className={`health ${subscription.health}`}
            title={`Health: ${subscription.health}`}
          />
          <ProductThumb name={productName} imageUrl={subscription.imageUrl} />
          <div>
            <strong>{productName}</strong>
            <div className="muted">
              {subscription.planName} ·{' '}
              {formatFrequency(subscription.frequency)}
            </div>
          </div>
        </div>
        <span className={`badge ${subscription.status}`}>
          {subscription.status.replace('_', ' ')}
        </span>
      </div>

      <p className="muted">
        Next charge:{' '}
        {subscription.nextBillingDate
          ? new Date(subscription.nextBillingDate).toLocaleDateString()
          : '—'}
        {subscription.unitPrice
          ? ` · ${subscription.currencyCode ?? 'USD'} ${subscription.unitPrice.toFixed(2)}`
          : null}
      </p>

      <div className="row actions-row">
        <label className="field inline-action">
          <span className="muted">Pause</span>
          <select
            defaultValue=""
            disabled={actions.pause.isPending}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              const days = value === 'indefinite' ? 3650 : Number(value);
              actions.pause.mutate(days);
              event.target.value = '';
            }}
          >
            <option value="" disabled>
              Choose duration
            </option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="indefinite">Indefinite</option>
          </select>
        </label>

        <button
          type="button"
          className="btn secondary"
          disabled={actions.skip.isPending}
          onClick={() => actions.skip.mutate()}
        >
          Skip next
        </button>

        <label className="field inline-action">
          <span className="muted">Swap</span>
          <select
            defaultValue=""
            disabled={actions.swap.isPending || swapOptions.length === 0}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              const option = swapOptions.find(
                (item) => item.productId === value,
              );
              if (!option) return;
              actions.swap.mutate({
                newProductId: option.productId,
                newVariantId: option.variantId,
              });
              event.target.value = '';
            }}
          >
            <option value="" disabled>
              {swapOptions.length ? 'Choose product' : 'No options'}
            </option>
            {swapOptions.map((option) => (
              <option key={option.productId} value={option.productId}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <Link className="btn" to={`/portal/${subscription.id}`}>
          Details
        </Link>
      </div>
    </motion.article>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useSubscriptions();

  if (isLoading) return <SkeletonCards count={3} />;

  if (isError) {
    return (
      <div className="card error-card stack">
        <h2>Could not load subscriptions</h2>
        <p className="muted">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <button type="button" className="btn" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const subscriptions = data?.subscriptions ?? [];

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        title="No active subscriptions"
        description="When you subscribe to a product on the storefront, it will show up here."
      />
    );
  }

  return (
    <div className="stack">
      <div>
        <h1>Your subscriptions</h1>
        <p className="muted">
          Hi {data?.customer.firstName ?? 'there'} — manage deliveries in one
          place.
        </p>
      </div>
      {subscriptions.map((subscription) => (
        <SubscriptionCard key={subscription.id} subscription={subscription} />
      ))}
    </div>
  );
}
