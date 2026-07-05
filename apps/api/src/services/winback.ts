import { EventSource, prisma } from '@retain/database';
import { env } from '../env.js';
import { getRedis } from '../lib/redis.js';
import { logEvent } from './events.js';
import { sendEmail } from './messaging.js';

export type WinbackJob = {
  shopId: string;
  contractId: string;
  customerId: string;
  email: string;
  customerName: string;
  shopName: string;
  cancelledAt: string;
  sentDays: number[];
};

const WINBACK_STEPS = [
  {
    day: 30,
    template: 'winback-day30',
    message: 'We miss you! Come back with 30% off your first order.',
    cta: 'Return with 30% off',
    discount: 30,
  },
  {
    day: 60,
    template: 'winback-day60',
    message: 'What would bring you back? Tell us in a quick survey.',
    cta: 'Share feedback',
    discount: 0,
  },
  {
    day: 90,
    template: 'winback-day90',
    message: 'Last chance — exclusive offer before we close your perks.',
    cta: 'Claim final offer',
    discount: 40,
  },
] as const;

function winbackKey(contractId: string): string {
  return `winback:${contractId}`;
}

export async function scheduleWinbackSequence(input: {
  shopId: string;
  contractId: string;
  customerId: string;
  email: string;
  customerName: string;
  shopName: string;
}): Promise<void> {
  const job: WinbackJob = {
    ...input,
    cancelledAt: new Date().toISOString(),
    sentDays: [],
  };

  const redis = getRedis();
  await redis.set(winbackKey(input.contractId), JSON.stringify(job));

  await logEvent({
    shopId: input.shopId,
    contractId: input.contractId,
    eventType: 'winback.scheduled',
    payload: { steps: WINBACK_STEPS.map((step) => step.day) },
    source: EventSource.system,
  });
}

function daysSinceCancel(cancelledAt: string): number {
  return Math.floor(
    (Date.now() - new Date(cancelledAt).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function returnLink(contractId: string, discount?: number): string {
  const portal = env.PORTAL_URL.replace(/\/$/, '');
  const query = discount ? `?discount=${discount}` : '';
  return `${portal}/portal/${contractId}${query}`;
}

export async function processDueWinbackEmails(): Promise<number> {
  const redis = getRedis();
  const keys = await redis.keys('winback:*');
  let sent = 0;

  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;

    const job = JSON.parse(raw) as WinbackJob;
    const elapsed = daysSinceCancel(job.cancelledAt);

    for (const step of WINBACK_STEPS) {
      if (elapsed >= step.day && !job.sentDays.includes(step.day)) {
        await sendEmail({
          to: job.email,
          template: step.template,
          context: {
            customerName: job.customerName,
            shopName: job.shopName,
            message: step.message,
            cta: step.cta,
            returnLink: returnLink(job.contractId, step.discount || undefined),
          },
        });

        job.sentDays.push(step.day);
        await redis.set(key, JSON.stringify(job));

        await logEvent({
          shopId: job.shopId,
          contractId: job.contractId,
          eventType: 'winback.sent',
          eventSubtype: `day_${step.day}`,
          payload: { template: step.template, discount: step.discount },
          source: EventSource.system,
        });

        sent += 1;
      }
    }

    if (job.sentDays.length >= WINBACK_STEPS.length) {
      await redis.del(key);
    }
  }

  return sent;
}

export async function cancelWinbackSequence(contractId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(winbackKey(contractId));
}

export async function getWinbackStats(shopId: string): Promise<{
  scheduled: number;
  sent: number;
}> {
  const [scheduledKeys, sentEvents] = await Promise.all([
    getRedis().keys('winback:*'),
    prisma.event.count({
      where: { shopId, eventType: 'winback.sent' },
    }),
  ]);

  return {
    scheduled: scheduledKeys.length,
    sent: sentEvents,
  };
}
