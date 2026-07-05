import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as api from '../lib/api';
import { useSubscriptionActions } from '../hooks/useSubscriptions';
import { SkeletonCards } from '../components/Skeleton';

const REASONS = [
  { id: 'too_expensive', label: 'Too expensive' },
  { id: 'too_much_product', label: 'Too much product' },
  { id: 'want_different_product', label: 'Want different product' },
  { id: 'not_satisfied', label: 'Not satisfied' },
  { id: 'other', label: 'Other' },
] as const;

export function CancelPage() {
  const { contractId = '' } = useParams();
  const navigate = useNavigate();
  const actions = useSubscriptionActions(contractId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState('too_expensive');
  const [feedback, setFeedback] = useState('');

  const offerQuery = useQuery({
    queryKey: ['cancel-offer', contractId, reason],
    queryFn: () => api.getCancelOffer(contractId, reason),
    enabled: step >= 2,
  });

  if (actions.cancel.isSuccess) {
    return (
      <div className="card empty stack">
        <h1>Subscription canceled</h1>
        <p className="muted">We are sorry to see you go.</p>
        <Link className="btn" to="/portal">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <Link to={`/portal/${contractId}`} className="muted">
        ← Back
      </Link>
      <h1>Cancel subscription</h1>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.section
            key="step1"
            className="card stack"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
          >
            <h2>Why are you leaving?</h2>
            <div className="radio-list">
              {REASONS.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === item.id}
                    onChange={() => setReason(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => setStep(2)}>
              Continue
            </button>
          </motion.section>
        ) : null}

        {step === 2 ? (
          <motion.section
            key="step2"
            className="card stack"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
          >
            <h2>Before you go</h2>
            {offerQuery.isLoading ? <SkeletonCards count={1} /> : null}
            {offerQuery.data ? (
              <>
                <h3>{offerQuery.data.offer.title}</h3>
                <p className="muted">{offerQuery.data.offer.description}</p>
              </>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => navigate(`/portal/${contractId}`)}
              >
                Keep my subscription
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setStep(3)}
              >
                Continue to cancel
              </button>
            </div>
          </motion.section>
        ) : null}

        {step === 3 ? (
          <motion.section
            key="step3"
            className="card stack"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
          >
            <h2>Confirm cancellation</h2>
            <p>
              Reason:{' '}
              <strong>
                {REASONS.find((item) => item.id === reason)?.label}
              </strong>
            </p>
            <label className="field">
              <span>Anything else we should know?</span>
              <textarea
                rows={4}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
              />
            </label>
            {actions.cancel.isError ? (
              <p style={{ color: 'var(--red)' }}>
                {actions.cancel.error instanceof Error
                  ? actions.cancel.error.message
                  : 'Cancel failed'}
              </p>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => navigate(`/portal/${contractId}`)}
              >
                Keep my subscription
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={actions.cancel.isPending}
                onClick={() => actions.cancel.mutate({ reason, feedback })}
              >
                Cancel anyway
              </button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
