import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SkeletonCards } from '../components/Skeleton';
import {
  useSubscriptionActions,
  useSubscriptions,
} from '../hooks/useSubscriptions';

const PREFS_KEY = 'retain_portal_prefs';

type Prefs = {
  emailOn: boolean;
  smsOn: boolean;
  pauseDuration: string;
  frequency: string;
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return {
        emailOn: true,
        smsOn: false,
        pauseDuration: '30',
        frequency: 'month',
      };
    }
    return JSON.parse(raw) as Prefs;
  } catch {
    return {
      emailOn: true,
      smsOn: false,
      pauseDuration: '30',
      frequency: 'month',
    };
  }
}

export function ManagePage() {
  const { data, isLoading, isError, error, refetch } = useSubscriptions();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [address1, setAddress1] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [saved, setSaved] = useState(false);

  const primary = data?.subscriptions[0];
  const actions = useSubscriptionActions(primary?.id ?? '');

  useEffect(() => {
    const address = primary?.shippingAddress as
      | {
          address1?: string;
          city?: string;
          zip?: string;
        }
      | null
      | undefined;
    if (!address) return;
    setAddress1(address.address1 ?? '');
    setCity(address.city ?? '');
    setZip(address.zip ?? '');
  }, [primary]);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  if (isLoading) return <SkeletonCards count={2} />;

  if (isError) {
    return (
      <div className="card error-card stack">
        <h2>Could not load preferences</h2>
        <p className="muted">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <button type="button" className="btn" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      className="stack"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div>
        <h1>Manage account</h1>
        <p className="muted">Preferences apply across your subscriptions.</p>
      </div>

      <section className="card stack">
        <h2>Frequency</h2>
        <label className="field">
          <span>Delivery cadence</span>
          <select
            value={prefs.frequency}
            onChange={(event) =>
              setPrefs((current) => ({
                ...current,
                frequency: event.target.value,
              }))
            }
          >
            <option value="week">Every week</option>
            <option value="month">Every month</option>
            <option value="two_month">Every 2 months</option>
          </select>
        </label>
        <p className="muted">
          Frequency changes sync on your next billing cycle for{' '}
          {primary?.planName ?? 'your plan'}.
        </p>
      </section>

      <section className="card stack">
        <h2>Shipping address</h2>
        <label className="field">
          <span>Address</span>
          <input
            value={address1}
            onChange={(event) => setAddress1(event.target.value)}
          />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>City</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Postal code</span>
            <input
              value={zip}
              onChange={(event) => setZip(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
          }}
        >
          Save address
        </button>
        {saved ? <p className="muted">Address saved locally for now.</p> : null}
      </section>

      <section className="card stack">
        <h2>Notifications</h2>
        <label className="row">
          <input
            type="checkbox"
            checked={prefs.emailOn}
            onChange={(event) =>
              setPrefs((current) => ({
                ...current,
                emailOn: event.target.checked,
              }))
            }
          />
          Email updates
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={prefs.smsOn}
            onChange={(event) =>
              setPrefs((current) => ({
                ...current,
                smsOn: event.target.checked,
              }))
            }
          />
          SMS updates
        </label>
      </section>

      <section className="card stack">
        <h2>Pause settings</h2>
        <label className="field">
          <span>Default pause duration</span>
          <select
            value={prefs.pauseDuration}
            onChange={(event) =>
              setPrefs((current) => ({
                ...current,
                pauseDuration: event.target.value,
              }))
            }
          >
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="indefinite">Indefinite</option>
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={!primary || actions.pause.isPending}
          onClick={() => {
            if (!primary) return;
            const days =
              prefs.pauseDuration === 'indefinite'
                ? 3650
                : Number(prefs.pauseDuration);
            actions.pause.mutate(days);
          }}
        >
          Pause primary subscription
        </button>
      </section>
    </motion.div>
  );
}
