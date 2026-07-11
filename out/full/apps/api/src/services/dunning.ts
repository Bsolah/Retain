import {
  ContractStatus,
  EventSource,
  InterventionStatus,
  InterventionType,
  prisma,
} from '@retain/database';
import {
  paymentUpdateUrl,
  createPaymentUpdateToken,
} from '../lib/payment-token.js';
import { getRedis } from '../lib/redis.js';
import { attemptBilling } from './billing-scheduler.js';
import { logEvent } from './events.js';
import { renderSmsFromTemplate, sendEmail, sendSms } from './messaging.js';

export type DunningCampaign = {
  contractId: string;
  shopId: string;
  startedAt: string;
  failureCode: string;
  cardBrand: string;
  paymentFailureCount: number;
  completedSteps: number[];
  timezoneOffsetMinutes: number;
};

type DunningStep = {
  day: number;
  channels: Array<'email' | 'sms' | 'portal_banner'>;
  retry: boolean;
  emailTemplate: string;
  smsTemplate?: string;
};

const DUNNING_SCHEDULE: DunningStep[] = [
  {
    day: 0,
    channels: ['email'],
    retry: false,
    emailTemplate: 'dunning-day0',
  },
  {
    day: 1,
    channels: ['email'],
    retry: true,
    emailTemplate: 'dunning-day1',
  },
  {
    day: 3,
    channels: ['email', 'sms'],
    retry: true,
    emailTemplate: 'dunning-day3',
    smsTemplate: 'dunning-sms-day3',
  },
  {
    day: 7,
    channels: ['email', 'sms', 'portal_banner'],
    retry: true,
    emailTemplate: 'dunning-day7',
    smsTemplate: 'dunning-sms-day3',
  },
  {
    day: 14,
    channels: ['email', 'sms', 'portal_banner'],
    retry: true,
    emailTemplate: 'dunning-day14',
    smsTemplate: 'dunning-sms-day3',
  },
];

const AMEX_RETRY_HOURS = [6, 14, 22];
const DEFAULT_RETRY_HOURS = [3, 15];

function campaignKey(contractId: string): string {
  return `dunning:campaign:${contractId}`;
}

function portalBannerKey(contractId: string): string {
  return `portal:banner:${contractId}`;
}

function daysSince(iso: string): number {
  const start = new Date(iso).getTime();
  return Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
}

export function getOptimalRetryHour(input: {
  failureCode: string;
  cardBrand: string;
  timezoneOffsetMinutes?: number;
}): Date {
  const isInsufficientFunds = /insufficient_funds/i.test(input.failureCode);
  const isAmex = /amex|american express/i.test(input.cardBrand);
  const hours = isAmex ? AMEX_RETRY_HOURS : DEFAULT_RETRY_HOURS;
  const targetHour = isInsufficientFunds ? hours[0]! : (hours[1] ?? hours[0]!);

  const retryAt = new Date();
  const localOffset = input.timezoneOffsetMinutes ?? 0;
  const localHour = (retryAt.getUTCHours() + localOffset / 60 + 24) % 24;

  if (localHour >= targetHour) {
    retryAt.setUTCDate(retryAt.getUTCDate() + 1);
  }

  retryAt.setUTCHours(
    targetHour - Math.floor(localOffset / 60),
    isInsufficientFunds ? 0 : 30,
    0,
    0,
  );
  return retryAt;
}

export function shouldSendSmsEarly(paymentFailureCount: number): boolean {
  return paymentFailureCount >= 3;
}

async function loadContractContext(contractId: string) {
  return prisma.subscriptionContract.findUnique({
    where: { id: contractId },
    include: {
      customer: true,
      shop: true,
      signals: { take: 1, orderBy: { calculatedAt: 'desc' } },
    },
  });
}

function buildMessageContext(
  contract: NonNullable<Awaited<ReturnType<typeof loadContractContext>>>,
  updateLink: string,
) {
  const customerName =
    [contract.customer.firstName, contract.customer.lastName]
      .filter(Boolean)
      .join(' ') || 'there';

  return {
    customerName,
    shopName: contract.shop.shopifyDomain.replace('.myshopify.com', ''),
    updateLink,
    day: 0,
  };
}

/**
 * Start or refresh a dunning campaign after payment failure.
 */
export async function triggerDunningWorkflow(
  contractId: string,
  reason: string,
  options?: {
    failureCode?: string;
    cardBrand?: string;
  },
): Promise<void> {
  const contract = await loadContractContext(contractId);
  if (!contract) return;

  const signal = contract.signals[0];
  const paymentFailureCount = signal?.paymentFailureCount30d ?? 1;

  const campaign: DunningCampaign = {
    contractId: contract.id,
    shopId: contract.shopId,
    startedAt: new Date().toISOString(),
    failureCode: options?.failureCode ?? reason,
    cardBrand: options?.cardBrand ?? 'unknown',
    paymentFailureCount,
    completedSteps: [],
    timezoneOffsetMinutes: 0,
  };

  const redis = getRedis();
  await redis.set(
    campaignKey(contractId),
    JSON.stringify(campaign),
    'EX',
    60 * 60 * 24 * 21,
  );

  await prisma.intervention.create({
    data: {
      shopId: contract.shopId,
      contractId: contract.id,
      interventionType: InterventionType.dunning_retry,
      triggerReason: reason,
      messageSubject: 'Payment failed — update your payment method',
      messageBody: reason,
      status: InterventionStatus.pending,
      isAuto: true,
      createdBy: 'dunning-engine',
      offerValue: {
        type: 'dunning_retry',
        reason,
        failureCode: campaign.failureCode,
        cardBrand: campaign.cardBrand,
      },
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'dunning.triggered',
    eventSubtype: 'payment_failed',
    payload: {
      reason,
      failureCode: campaign.failureCode,
      cardBrand: campaign.cardBrand,
      paymentFailureCount,
    },
    source: EventSource.system,
  });

  await executeDunningStep(contractId, 0);
}

export async function executeDunningStep(
  contractId: string,
  stepDay: number,
): Promise<void> {
  const redis = getRedis();
  const raw = await redis.get(campaignKey(contractId));
  if (!raw) return;

  const campaign = JSON.parse(raw) as DunningCampaign;
  if (campaign.completedSteps.includes(stepDay)) return;

  const step = DUNNING_SCHEDULE.find((item) => item.day === stepDay);
  if (!step) return;

  const contract = await loadContractContext(contractId);
  if (!contract || contract.status === ContractStatus.cancelled) return;

  const token = createPaymentUpdateToken({
    contractId: contract.id,
    shopId: contract.shopId,
    customerId: contract.customerId,
  });
  const updateLink = paymentUpdateUrl(token);
  const context = buildMessageContext(contract, updateLink);

  const methods: string[] = [];

  if (step.channels.includes('email') && contract.customer.email) {
    await sendEmail({
      to: contract.customer.email,
      template: step.emailTemplate,
      context: { ...context, day: stepDay },
    });
    methods.push('email');
  }

  const smsDay =
    shouldSendSmsEarly(campaign.paymentFailureCount) && stepDay >= 1
      ? Math.max(1, stepDay - 1)
      : stepDay;

  if (
    step.channels.includes('sms') &&
    step.smsTemplate &&
    contract.customer.phone &&
    contract.customer.smsConsent &&
    smsDay >= 3
  ) {
    const body = renderSmsFromTemplate(step.smsTemplate, {
      ...context,
      day: stepDay,
    });
    await sendSms({ to: contract.customer.phone, body });
    methods.push('sms');
  }

  if (step.channels.includes('portal_banner')) {
    await redis.set(
      portalBannerKey(contractId),
      JSON.stringify({
        tone: 'critical',
        title: 'Payment failed',
        message: 'Update your payment method to avoid subscription suspension.',
        updateLink,
        createdAt: new Date().toISOString(),
      }),
      'EX',
      60 * 60 * 24 * 14,
    );
    methods.push('portal_banner');
  }

  if (step.retry) {
    const retryAt = getOptimalRetryHour({
      failureCode: campaign.failureCode,
      cardBrand: campaign.cardBrand,
      timezoneOffsetMinutes: campaign.timezoneOffsetMinutes,
    });
    if (retryAt <= new Date()) {
      await attemptBilling(contractId, { bypassSchedule: true });
    }
  }

  campaign.completedSteps.push(stepDay);
  await redis.set(
    campaignKey(contractId),
    JSON.stringify(campaign),
    'EX',
    60 * 60 * 24 * 21,
  );

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'dunning.step',
    eventSubtype: `day_${stepDay}`,
    payload: {
      methods,
      failureCode: campaign.failureCode,
      retry: step.retry,
    },
    source: EventSource.system,
  });
}

export async function processDueDunningSteps(): Promise<number> {
  const redis = getRedis();
  const keys = await redis.keys('dunning:campaign:*');
  let processed = 0;

  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;

    const campaign = JSON.parse(raw) as DunningCampaign;
    const elapsed = daysSince(campaign.startedAt);

    for (const step of DUNNING_SCHEDULE) {
      if (elapsed >= step.day && !campaign.completedSteps.includes(step.day)) {
        await executeDunningStep(campaign.contractId, step.day);
        processed += 1;
      }
    }
  }

  return processed;
}

export async function recordDunningRecovery(
  contractId: string,
  method: string,
): Promise<void> {
  const redis = getRedis();
  const raw = await redis.get(campaignKey(contractId));
  if (!raw) return;

  const campaign = JSON.parse(raw) as DunningCampaign;
  const recoveryDay = daysSince(campaign.startedAt);

  const contract = await prisma.subscriptionContract.findUnique({
    where: { id: contractId },
  });
  if (!contract) return;

  await logEvent({
    shopId: contract.shopId,
    contractId,
    eventType: 'dunning.recovered',
    eventSubtype: method,
    payload: {
      recoveryDay,
      failureCode: campaign.failureCode,
      method,
    },
    source: EventSource.system,
  });

  await redis.del(campaignKey(contractId));
  await redis.del(portalBannerKey(contractId));

  await prisma.intervention.updateMany({
    where: {
      contractId,
      interventionType: InterventionType.dunning_retry,
      status: { in: [InterventionStatus.pending, InterventionStatus.sent] },
    },
    data: {
      status: InterventionStatus.accepted,
      outcome: 'saved',
      respondedAt: new Date(),
    },
  });
}

export async function getDunningRecoveryStats(shopId: string): Promise<{
  totalFailures: number;
  recovered: number;
  recoveryRate: number;
  byDay: Record<string, number>;
  byMethod: Record<string, number>;
  byFailureCode: Record<string, number>;
}> {
  const [failures, recoveries] = await Promise.all([
    prisma.event.findMany({
      where: { shopId, eventType: 'dunning.triggered' },
      select: { payload: true },
    }),
    prisma.event.findMany({
      where: { shopId, eventType: 'dunning.recovered' },
      select: { payload: true, eventSubtype: true },
    }),
  ]);

  const byDay: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  const byFailureCode: Record<string, number> = {};

  for (const row of recoveries) {
    const payload = row.payload as {
      recoveryDay?: number;
      failureCode?: string;
    };
    const day = String(payload.recoveryDay ?? 'unknown');
    byDay[day] = (byDay[day] ?? 0) + 1;
    byMethod[row.eventSubtype ?? 'unknown'] =
      (byMethod[row.eventSubtype ?? 'unknown'] ?? 0) + 1;
    const code = payload.failureCode ?? 'unknown';
    byFailureCode[code] = (byFailureCode[code] ?? 0) + 1;
  }

  const totalFailures = failures.length;
  const recovered = recoveries.length;

  return {
    totalFailures,
    recovered,
    recoveryRate:
      totalFailures > 0
        ? Number(((recovered / totalFailures) * 100).toFixed(1))
        : 0,
    byDay,
    byMethod,
    byFailureCode,
  };
}

export type DunningRetryStatus = {
  enabled: true;
  active: boolean;
  startedAt: string | null;
  failureCode: string | null;
  cardBrand: string | null;
  paymentFailureCount: number;
  completedSteps: number[];
  nextRetryAt: string | null;
  nextStepDay: number | null;
  schedule: Array<{ day: number; retry: boolean; channels: string[] }>;
};

/** Dunning campaign + retry schedule for admin subscriber detail. */
export async function getDunningCampaignStatus(
  contractId: string,
): Promise<DunningRetryStatus> {
  const redis = getRedis();
  const raw = await redis.get(campaignKey(contractId));
  const schedule = DUNNING_SCHEDULE.map((step) => ({
    day: step.day,
    retry: step.retry,
    channels: [...step.channels],
  }));

  if (!raw) {
    return {
      enabled: true,
      active: false,
      startedAt: null,
      failureCode: null,
      cardBrand: null,
      paymentFailureCount: 0,
      completedSteps: [],
      nextRetryAt: null,
      nextStepDay: null,
      schedule,
    };
  }

  const campaign = JSON.parse(raw) as DunningCampaign;
  const elapsed = daysSince(campaign.startedAt);
  const nextStep = DUNNING_SCHEDULE.find(
    (step) => elapsed < step.day || !campaign.completedSteps.includes(step.day),
  );
  const nextRetryAt =
    campaign.completedSteps.some(
      (day) => DUNNING_SCHEDULE.find((step) => step.day === day)?.retry,
    ) || nextStep?.retry
      ? getOptimalRetryHour({
          failureCode: campaign.failureCode,
          cardBrand: campaign.cardBrand,
          timezoneOffsetMinutes: campaign.timezoneOffsetMinutes,
        }).toISOString()
      : null;

  return {
    enabled: true,
    active: true,
    startedAt: campaign.startedAt,
    failureCode: campaign.failureCode,
    cardBrand: campaign.cardBrand,
    paymentFailureCount: campaign.paymentFailureCount,
    completedSteps: campaign.completedSteps,
    nextRetryAt,
    nextStepDay: nextStep?.day ?? null,
    schedule,
  };
}

export async function getPortalBanner(contractId: string): Promise<{
  tone: string;
  title: string;
  message: string;
  updateLink: string;
} | null> {
  const redis = getRedis();
  const raw = await redis.get(portalBannerKey(contractId));
  if (!raw) return null;
  return JSON.parse(raw) as {
    tone: string;
    title: string;
    message: string;
    updateLink: string;
  };
}
