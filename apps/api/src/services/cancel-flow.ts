import {
  EventSource,
  InterventionStatus,
  InterventionType,
  prisma,
} from '@retain/database';
import { getRedis } from '../lib/redis.js';
import {
  cancelContract,
  pauseContract,
  skipNextDelivery,
  swapProduct,
} from './contract-manager.js';
import { logEvent } from './events.js';
import { sendEmail } from './messaging.js';
import { scheduleWinbackSequence } from './winback.js';

export const CANCEL_REASONS = [
  'too_expensive',
  'too_much_product',
  'want_different_product',
  'not_satisfied',
  'temporary_break',
  'other',
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

export type CancelOffer =
  | {
      type: 'percentage';
      value: number;
      duration: string;
      message: string;
    }
  | {
      type: 'skip';
      value: number;
      message: string;
    }
  | {
      type: 'swap';
      suggested_product_id: string;
      message: string;
    }
  | {
      type: 'credit';
      value: number;
      message: string;
    }
  | {
      type: 'pause';
      max_days: number;
      message: string;
    };

function sessionKey(contractId: string): string {
  return `cancel-flow:${contractId}`;
}

export function calculateDiscountOffer(ltv: number): {
  type: 'percentage';
  value: number;
  duration: string;
} {
  let value = 10;
  if (ltv >= 500) value = 25;
  else if (ltv >= 200) value = 20;
  else if (ltv >= 100) value = 15;
  return { type: 'percentage', value, duration: 'next_3_orders' };
}

export async function startCancelFlow(contractId: string): Promise<{
  reasons: typeof CANCEL_REASONS;
  sessionId: string;
}> {
  const contract = await prisma.subscriptionContract.findUnique({
    where: { id: contractId },
  });
  if (!contract) {
    throw new Error('Contract not found');
  }

  const sessionId = `cfs_${contractId}_${Date.now()}`;
  const redis = getRedis();
  await redis.set(
    sessionKey(contractId),
    JSON.stringify({ sessionId, startedAt: new Date().toISOString() }),
    'EX',
    60 * 60,
  );

  await logEvent({
    shopId: contract.shopId,
    contractId,
    eventType: 'cancel_flow.started',
    payload: { sessionId },
    source: EventSource.customer,
  });

  return { reasons: [...CANCEL_REASONS], sessionId };
}

export async function buildCancelOffer(
  contractId: string,
  reason: CancelReason,
): Promise<{
  reason: CancelReason;
  offer: CancelOffer;
  interventionId: string;
}> {
  const contract = await prisma.subscriptionContract.findUnique({
    where: { id: contractId },
    include: { customer: true, plan: true, shop: true },
  });
  if (!contract) {
    throw new Error('Contract not found');
  }

  const ltv = Number(contract.customer.lifetimeValue ?? contract.totalRevenue);

  let offer: CancelOffer;
  switch (reason) {
    case 'too_expensive': {
      const discount = calculateDiscountOffer(ltv);
      offer = {
        ...discount,
        message: `Get ${discount.value}% off your ${discount.duration.replaceAll('_', ' ')}`,
      };
      break;
    }
    case 'too_much_product':
      offer = {
        type: 'skip',
        value: 2,
        message: 'Skip your next 2 deliveries',
      };
      break;
    case 'want_different_product':
      offer = {
        type: 'swap',
        suggested_product_id: contract.plan.productIds[0] ?? '',
        message: 'Swap to our bestseller on your next order',
      };
      break;
    case 'not_satisfied':
      offer = {
        type: 'credit',
        value: 10,
        message: '$10 credit + support escalation',
      };
      break;
    case 'temporary_break':
      offer = {
        type: 'pause',
        max_days: 90,
        message: 'Pause up to 90 days instead of cancelling',
      };
      break;
    default:
      offer = {
        type: 'pause',
        max_days: 30,
        message: 'Pause your subscription for up to 30 days',
      };
  }

  const intervention = await prisma.intervention.create({
    data: {
      shopId: contract.shopId,
      contractId: contract.id,
      interventionType: InterventionType.cancel_save,
      triggerReason: reason,
      messageSubject: offer.message,
      messageBody: offer.message,
      offerValue: offer as object,
      status: InterventionStatus.pending,
      isAuto: true,
      createdBy: 'cancel-flow',
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId,
    eventType: 'cancel_flow.offer',
    eventSubtype: reason,
    payload: { offer, interventionId: intervention.id },
    source: EventSource.customer,
  });

  return { reason, offer, interventionId: intervention.id };
}

async function applyOffer(
  contractId: string,
  offer: CancelOffer,
): Promise<void> {
  switch (offer.type) {
    case 'skip':
      for (let i = 0; i < offer.value; i += 1) {
        await skipNextDelivery({ id: contractId, actor: 'customer' });
      }
      break;
    case 'swap':
      if (offer.suggested_product_id) {
        await swapProduct({
          id: contractId,
          newProductId: offer.suggested_product_id,
          newVariantId: offer.suggested_product_id.replace(
            '/Product/',
            '/ProductVariant/',
          ),
          actor: 'customer',
        });
      }
      break;
    case 'pause':
      await pauseContract({
        id: contractId,
        durationDays: Math.min(offer.max_days, 90),
        actor: 'customer',
      });
      break;
    case 'percentage':
    case 'credit':
      await logEvent({
        shopId: (
          await prisma.subscriptionContract.findUniqueOrThrow({
            where: { id: contractId },
          })
        ).shopId,
        contractId,
        eventType: 'cancel_flow.offer_applied',
        payload: offer,
        source: EventSource.system,
      });
      break;
    default:
      break;
  }
}

export async function resolveCancelFlow(input: {
  contractId: string;
  action: 'accept' | 'cancel';
  interventionId?: string;
  reason?: CancelReason;
  feedback?: string;
}): Promise<{ status: 'saved' | 'cancelled'; contractId: string }> {
  const contract = await prisma.subscriptionContract.findUnique({
    where: { id: input.contractId },
    include: { customer: true, shop: true },
  });
  if (!contract) {
    throw new Error('Contract not found');
  }

  if (input.action === 'accept' && input.interventionId) {
    const intervention = await prisma.intervention.findFirst({
      where: { id: input.interventionId, contractId: input.contractId },
    });
    if (!intervention) {
      throw new Error('Offer not found');
    }

    const offer = intervention.offerValue as CancelOffer;
    await applyOffer(input.contractId, offer);

    await prisma.intervention.update({
      where: { id: intervention.id },
      data: {
        status: InterventionStatus.accepted,
        outcome: 'saved',
        respondedAt: new Date(),
        revenueImpact: contract.totalRevenue,
      },
    });

    await logEvent({
      shopId: contract.shopId,
      contractId: input.contractId,
      eventType: 'cancel_flow.saved',
      payload: { interventionId: intervention.id, offer },
      source: EventSource.customer,
    });

    const redis = getRedis();
    await redis.del(sessionKey(input.contractId));

    return { status: 'saved', contractId: input.contractId };
  }

  await cancelContract({
    id: input.contractId,
    reason: input.reason ?? 'other',
    feedback: input.feedback,
    actor: 'customer',
  });

  if (input.interventionId) {
    await prisma.intervention.updateMany({
      where: { id: input.interventionId },
      data: {
        status: InterventionStatus.declined,
        outcome: 'churned',
        respondedAt: new Date(),
      },
    });
  }

  await scheduleWinbackSequence({
    shopId: contract.shopId,
    contractId: contract.id,
    customerId: contract.customerId,
    email: contract.customer.email,
    customerName:
      [contract.customer.firstName, contract.customer.lastName]
        .filter(Boolean)
        .join(' ') || 'there',
    shopName: contract.shop.shopifyDomain.replace('.myshopify.com', ''),
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: input.contractId,
    eventType: 'cancel_flow.cancelled',
    eventSubtype: input.reason ?? 'other',
    payload: { feedback: input.feedback },
    source: EventSource.customer,
  });

  const redis = getRedis();
  await redis.del(sessionKey(input.contractId));

  return { status: 'cancelled', contractId: input.contractId };
}

export async function sendCancelSaveEmail(input: {
  email: string;
  customerName: string;
  shopName: string;
  offerMessage: string;
  acceptLink: string;
}): Promise<void> {
  await sendEmail({
    to: input.email,
    template: 'cancel-save-offer',
    context: {
      customerName: input.customerName,
      shopName: input.shopName,
      offerMessage: input.offerMessage,
      acceptLink: input.acceptLink,
    },
  });
}
