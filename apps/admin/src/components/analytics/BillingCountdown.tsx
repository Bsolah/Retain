import { Text } from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';

function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [
    days > 0 ? `${days}d` : null,
    `${hours}h`,
    `${minutes}m`,
    `${seconds}s`,
  ].filter(Boolean);

  return parts.join(' ');
}

export function BillingCountdown({
  targetIso,
  chargeStatus,
}: {
  targetIso: string | null;
  chargeStatus: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetIso) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetIso]);

  const label = useMemo(() => {
    if (!targetIso) return 'Next charge date not scheduled';
    const target = new Date(targetIso).getTime();
    const diff = target - now;

    if (chargeStatus === 'payment_failed') {
      return diff > 0
        ? `Retry scheduled in ${formatCountdown(diff)}`
        : `Retry overdue by ${formatCountdown(diff)}`;
    }

    if (chargeStatus === 'pending_payment') {
      return 'Awaiting payment for initial order';
    }

    if (diff > 0) {
      return `Next charge in ${formatCountdown(diff)}`;
    }

    return `Overdue by ${formatCountdown(diff)}`;
  }, [targetIso, now, chargeStatus]);

  return (
    <Text as="p" variant="bodyMd" fontWeight="semibold">
      {label}
    </Text>
  );
}

export function formatPreciseDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}
