export function addInterval(from: Date, policy: Record<string, unknown>): Date {
  const recurring =
    policy.recurring && typeof policy.recurring === 'object'
      ? (policy.recurring as Record<string, unknown>)
      : policy;
  const interval = String(recurring.interval ?? 'MONTH').toUpperCase();
  const count = Number(
    recurring.intervalCount ?? recurring.interval_count ?? 1,
  );
  const next = new Date(from);

  switch (interval) {
    case 'DAY':
      next.setUTCDate(next.getUTCDate() + count);
      break;
    case 'WEEK':
      next.setUTCDate(next.getUTCDate() + count * 7);
      break;
    case 'YEAR':
      next.setUTCFullYear(next.getUTCFullYear() + count);
      break;
    case 'MONTH':
    default:
      next.setUTCMonth(next.getUTCMonth() + count);
      break;
  }

  return next;
}

export function hasBillingInterval(
  policy: unknown,
): policy is Record<string, unknown> {
  if (!policy || typeof policy !== 'object') return false;
  const record = policy as Record<string, unknown>;
  const recurring =
    record.recurring && typeof record.recurring === 'object'
      ? (record.recurring as Record<string, unknown>)
      : record;
  return recurring.interval != null;
}

export function computeNextBillingDateFromPolicy(
  policy: unknown,
  baseDate: Date,
): Date | null {
  if (!hasBillingInterval(policy)) return null;
  return addInterval(baseDate, policy as Record<string, unknown>);
}
