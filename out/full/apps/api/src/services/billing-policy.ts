export function asDeliveryPolicy(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? { ...(value as Record<string, unknown>) }
    : {};
}

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

export function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function endOfUtcDay(date = new Date()): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
