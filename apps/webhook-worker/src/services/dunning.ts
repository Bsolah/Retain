import {
  EventSource,
  InterventionStatus,
  InterventionType,
  prisma,
} from '@retain/database';
import { logEvent } from './events.js';
import { getRedis } from '../lib/redis.js';

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

function campaignKey(contractId: string): string {
  return `dunning:campaign:${contractId}`;
}

export async function triggerDunningWorkflow(
  contractId: string,
  reason: string,
  options?: { failureCode?: string; cardBrand?: string },
): Promise<void> {
  const contract = await prisma.subscriptionContract.findUnique({
    where: { id: contractId },
    include: {
      signals: { take: 1, orderBy: { calculatedAt: 'desc' } },
    },
  });
  if (!contract) return;

  const paymentFailureCount = contract.signals[0]?.paymentFailureCount30d ?? 1;

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

  await getRedis().set(
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
      createdBy: 'webhook-worker',
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
      paymentFailureCount,
    },
    source: EventSource.system,
  });
}
