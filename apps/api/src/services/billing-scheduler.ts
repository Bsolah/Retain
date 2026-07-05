import {
  ContractStatus,
  EventSource,
  OrderStatus,
  Prisma,
  prisma,
} from '@retain/database';
import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import { shopifyAdminGraphql } from './shopify-client.js';
import {
  addInterval,
  asDeliveryPolicy,
  endOfUtcDay,
  startOfUtcDay,
} from './billing-policy.js';
import { logEvent } from './events.js';
import { triggerDunningWorkflow, recordDunningRecovery } from './dunning.js';

const BILLING_ATTEMPT_MUTATION = `#graphql
  mutation SubscriptionBillingAttemptCreate(
    $subscriptionContractId: ID!
    $subscriptionBillingAttemptInput: SubscriptionBillingAttemptInput!
  ) {
    subscriptionBillingAttemptCreate(
      subscriptionContractId: $subscriptionContractId
      subscriptionBillingAttemptInput: $subscriptionBillingAttemptInput
    ) {
      subscriptionBillingAttempt {
        id
        ready
        errorMessage
        errorCode
        order {
          id
          name
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

let scheduledTask: cron.ScheduledTask | null = null;

export function startBillingScheduler(): void {
  if (scheduledTask) {
    return;
  }

  // Daily at 06:00 UTC
  scheduledTask = cron.schedule(
    '0 6 * * *',
    () => {
      void processDueBillings().catch((error) => {
        console.error('Billing scheduler failed', error);
      });
    },
    { timezone: 'UTC' },
  );

  console.log('Billing scheduler started (daily 06:00 UTC)');
}

export function stopBillingScheduler(): void {
  scheduledTask?.stop();
  scheduledTask = null;
}

export async function processDueBillings(referenceDate = new Date()): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const start = startOfUtcDay(referenceDate);
  const end = endOfUtcDay(referenceDate);

  const dueContracts = await prisma.subscriptionContract.findMany({
    where: {
      status: ContractStatus.active,
      nextBillingDate: {
        gte: start,
        lte: end,
      },
    },
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;

  for (const row of dueContracts) {
    try {
      const result = await attemptBilling(row.id);
      if (result === 'success') succeeded += 1;
      if (result === 'failed') failed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Billing failed for contract ${row.id}`, error);
    }
  }

  return {
    processed: dueContracts.length,
    succeeded,
    failed,
  };
}

export async function attemptBilling(
  contractId: string,
  options?: { bypassSchedule?: boolean },
): Promise<'success' | 'failed' | 'skipped'> {
  const contract = await prisma.subscriptionContract.findUnique({
    where: { id: contractId },
    include: { shop: true },
  });

  if (!contract) {
    throw new Error(`Contract ${contractId} not found`);
  }

  if (
    contract.status !== ContractStatus.active &&
    contract.status !== ContractStatus.payment_failed
  ) {
    return 'skipped';
  }

  if (!options?.bypassSchedule && contract.nextBillingDate) {
    const start = startOfUtcDay();
    const end = endOfUtcDay();
    if (contract.nextBillingDate < start || contract.nextBillingDate > end) {
      return 'skipped';
    }
  }

  // Idempotency: one attempt key per contract per UTC day.
  const dayKey = startOfUtcDay().toISOString().slice(0, 10);
  const idempotencyKey = `billing:${contract.id}:${dayKey}`;

  if (contract.lastBillingAttemptId?.includes(dayKey)) {
    return 'skipped';
  }

  // Redis-free DB guard: if we already stored today's attempt id pattern.
  const existingAttempt = await prisma.subscriptionContract.findFirst({
    where: {
      id: contract.id,
      lastBillingAttemptId: { not: null },
      lastBillingDate: {
        gte: startOfUtcDay(),
        lte: endOfUtcDay(),
      },
    },
  });
  if (existingAttempt && !options?.bypassSchedule) {
    return 'skipped';
  }

  const originTime = new Date().toISOString();

  const data = await shopifyAdminGraphql<{
    subscriptionBillingAttemptCreate: {
      subscriptionBillingAttempt: {
        id: string;
        ready: boolean;
        errorMessage: string | null;
        errorCode: string | null;
        order: {
          id: string;
          name: string;
          totalPriceSet: {
            shopMoney: { amount: string; currencyCode: string };
          };
        } | null;
      } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(contract.shop, BILLING_ATTEMPT_MUTATION, {
    subscriptionContractId: contract.shopifyContractId,
    subscriptionBillingAttemptInput: {
      idempotencyKey: options?.bypassSchedule
        ? `${idempotencyKey}:run-now:${randomUUID()}`
        : idempotencyKey,
      originTime,
    },
  });

  const payload = data.subscriptionBillingAttemptCreate;
  if (payload.userErrors.length > 0) {
    await markPaymentFailed(
      contract.id,
      payload.userErrors.map((error) => error.message).join('; '),
    );
    return 'failed';
  }

  const attempt = payload.subscriptionBillingAttempt;
  if (!attempt) {
    await markPaymentFailed(contract.id, 'No billing attempt returned');
    return 'failed';
  }

  // Persist attempt id immediately to prevent double-charge on retries.
  await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: { lastBillingAttemptId: attempt.id },
  });

  if (attempt.errorMessage || attempt.errorCode || !attempt.order) {
    await markPaymentFailed(
      contract.id,
      attempt.errorMessage ?? attempt.errorCode ?? 'Billing attempt failed',
      attempt.id,
      attempt.errorCode ?? undefined,
    );
    return 'failed';
  }

  const amount = Number(attempt.order.totalPriceSet.shopMoney.amount);
  const currency = attempt.order.totalPriceSet.shopMoney.currencyCode;
  const billingPolicy = asDeliveryPolicy(contract.billingPolicy);
  const nextBillingDate = addInterval(new Date(), billingPolicy);

  const wasPaymentFailed = contract.status === ContractStatus.payment_failed;

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionOrder.create({
      data: {
        shopId: contract.shopId,
        customerId: contract.customerId,
        contractId: contract.id,
        shopifyOrderId: attempt.order!.id,
        orderNumber: attempt.order!.name,
        totalPrice: new Prisma.Decimal(amount),
        currency: currency.slice(0, 3),
        status: OrderStatus.paid,
        billingCycle: contract.totalCharges + 1,
        isOneOff: false,
      },
    });

    await tx.subscriptionContract.update({
      where: { id: contract.id },
      data: {
        status: ContractStatus.active,
        lastBillingDate: new Date(),
        nextBillingDate,
        lastOrderId: attempt.order!.id,
        lastBillingAttemptId: attempt.id,
        totalCharges: { increment: 1 },
        totalRevenue: { increment: amount },
        consecutiveSkips: 0,
      },
    });
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.billed',
    eventSubtype: 'success',
    payload: {
      billingAttemptId: attempt.id,
      orderId: attempt.order.id,
      amount,
      currency,
      nextBillingDate,
    },
    source: EventSource.system,
  });

  if (wasPaymentFailed) {
    await recordDunningRecovery(contract.id, 'billing_retry');
  }

  return 'success';
}

async function markPaymentFailed(
  contractId: string,
  reason: string,
  billingAttemptId?: string,
  failureCode?: string,
): Promise<void> {
  const contract = await prisma.subscriptionContract.update({
    where: { id: contractId },
    data: {
      status: ContractStatus.payment_failed,
      ...(billingAttemptId ? { lastBillingAttemptId: billingAttemptId } : {}),
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.billed',
    eventSubtype: 'payment_failed',
    payload: { reason, billingAttemptId, failureCode },
    source: EventSource.system,
  });

  await triggerDunningWorkflow(contract.id, reason, { failureCode });
}
