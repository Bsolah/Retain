import {
  ContractStatus,
  EventSource,
  OrderStatus,
  Prisma,
  prisma,
  type Shop,
} from '@retain/database';
import {
  computeNextBillingDateFromPolicy,
  hasBillingInterval,
  reconcilePendingSubscriptionOrderPayment,
} from '@retain/shopify-admin';
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

const MAX_CATCH_UP_ATTEMPTS = 14;
const BILLING_POLL_INTERVAL_MS = 2_000;
const BILLING_POLL_MAX_ATTEMPTS = 15;

const BILLING_ATTEMPT_QUERY = `#graphql
  query SubscriptionBillingAttempt($id: ID!) {
    subscriptionBillingAttempt(id: $id) {
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
  }
`;

type BillingAttemptSnapshot = {
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
};

let scheduledTask: cron.ScheduledTask | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBillingAttempt(
  shop: Shop,
  attemptId: string,
): Promise<BillingAttemptSnapshot | null> {
  const data = await shopifyAdminGraphql<{
    subscriptionBillingAttempt: BillingAttemptSnapshot | null;
  }>(shop, BILLING_ATTEMPT_QUERY, { id: attemptId });

  return data.subscriptionBillingAttempt;
}

async function pollBillingAttemptUntilReady(
  shop: Shop,
  attemptId: string,
): Promise<BillingAttemptSnapshot | null> {
  for (let attempt = 0; attempt < BILLING_POLL_MAX_ATTEMPTS; attempt += 1) {
    const snapshot = await fetchBillingAttempt(shop, attemptId);
    if (!snapshot) return null;
    if (snapshot.errorMessage || snapshot.errorCode || snapshot.order) {
      return snapshot;
    }
    if (snapshot.ready) {
      return snapshot;
    }
    await sleep(BILLING_POLL_INTERVAL_MS);
  }
  return fetchBillingAttempt(shop, attemptId);
}

async function completeSuccessfulBilling(
  contract: {
    id: string;
    shopId: string;
    customerId: string;
    status: ContractStatus;
    billingPolicy: unknown;
    nextBillingDate: Date | null;
    totalCharges: number;
  },
  attempt: BillingAttemptSnapshot,
  options?: { scheduleFromDueDate?: boolean },
): Promise<void> {
  if (!attempt.order) {
    throw new Error('Cannot complete billing without an order');
  }

  const existingOrder = await prisma.subscriptionOrder.findFirst({
    where: {
      shopId: contract.shopId,
      shopifyOrderId: attempt.order.id,
    },
  });

  const amount = Number(attempt.order.totalPriceSet.shopMoney.amount);
  const currency = attempt.order.totalPriceSet.shopMoney.currencyCode;
  const billingPolicy = asDeliveryPolicy(contract.billingPolicy);
  const end = endOfUtcDay();
  const anchor =
    options?.scheduleFromDueDate &&
    contract.nextBillingDate &&
    contract.nextBillingDate <= end
      ? contract.nextBillingDate
      : new Date();
  const nextBillingDate = addInterval(anchor, billingPolicy);
  const wasPaymentFailed = contract.status === ContractStatus.payment_failed;

  if (existingOrder) {
    await prisma.subscriptionContract.update({
      where: { id: contract.id },
      data: {
        status: ContractStatus.active,
        lastBillingDate: existingOrder.createdAt,
        nextBillingDate,
        lastOrderId: attempt.order.id,
        lastBillingAttemptId: attempt.id,
        consecutiveSkips: 0,
      },
    });
    if (wasPaymentFailed) {
      await recordDunningRecovery(contract.id, 'billing_retry');
    }
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionOrder.upsert({
      where: {
        shopId_shopifyOrderId: {
          shopId: contract.shopId,
          shopifyOrderId: attempt.order!.id,
        },
      },
      create: {
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
      update: {
        status: OrderStatus.paid,
        totalPrice: new Prisma.Decimal(amount),
        orderNumber: attempt.order!.name,
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
}

/** Recover orders when Shopify finished billing asynchronously. */
export async function reconcilePendingBillingAttempts(): Promise<number> {
  const rows = await prisma.subscriptionContract.findMany({
    where: {
      lastBillingAttemptId: {
        startsWith: 'gid://shopify/SubscriptionBillingAttempt/',
      },
      OR: [{ status: ContractStatus.payment_failed }, { totalCharges: 0 }],
    },
    include: { shop: true },
    take: 100,
  });

  let fixed = 0;
  for (const contract of rows) {
    if (!contract.lastBillingAttemptId) continue;

    const attempt = await fetchBillingAttempt(
      contract.shop,
      contract.lastBillingAttemptId,
    );
    if (!attempt?.order) continue;

    const existingOrder = await prisma.subscriptionOrder.findFirst({
      where: {
        contractId: contract.id,
        shopifyOrderId: attempt.order.id,
      },
      include: { contract: true },
    });

    // Payment-link creates leave an unpaid pending order — complete once Shopify
    // shows the order as paid (do not skip active contracts with totalCharges 0).
    if (
      existingOrder?.status === OrderStatus.pending &&
      existingOrder.contract
    ) {
      const completed = await reconcilePendingSubscriptionOrderPayment(
        contract.shop,
        {
          id: existingOrder.id,
          contractId: existingOrder.contractId,
          customerId: existingOrder.customerId,
          shopifyOrderId: existingOrder.shopifyOrderId,
          totalPrice: existingOrder.totalPrice,
          status: existingOrder.status,
          contract: {
            id: existingOrder.contract.id,
            shopifyContractId: existingOrder.contract.shopifyContractId,
            billingPolicy: existingOrder.contract.billingPolicy,
            totalCharges: existingOrder.contract.totalCharges,
          },
        },
      );
      if (completed) {
        fixed += 1;
      }
      continue;
    }

    if (
      existingOrder &&
      existingOrder.status === OrderStatus.paid &&
      contract.totalCharges > 0
    ) {
      continue;
    }

    await completeSuccessfulBilling(contract, attempt, {
      scheduleFromDueDate: true,
    });
    fixed += 1;
  }

  return fixed;
}

function initialNextBillingDate(contract: {
  billingPolicy: unknown;
  lastBillingDate: Date | null;
  createdAt: Date;
}): Date | null {
  if (!hasBillingInterval(contract.billingPolicy)) {
    return null;
  }
  return computeNextBillingDateFromPolicy(
    contract.billingPolicy,
    contract.lastBillingDate ?? contract.createdAt,
  );
}

/** Backfill missing nextBillingDate on active contracts. */
export async function reconcileBillingSchedules(): Promise<number> {
  const rows = await prisma.subscriptionContract.findMany({
    where: {
      status: ContractStatus.active,
      nextBillingDate: null,
    },
    select: {
      id: true,
      billingPolicy: true,
      lastBillingDate: true,
      createdAt: true,
    },
  });

  let updated = 0;
  for (const row of rows) {
    const next = initialNextBillingDate(row);
    if (!next) continue;
    await prisma.subscriptionContract.update({
      where: { id: row.id },
      data: { nextBillingDate: next },
    });
    updated += 1;
  }
  return updated;
}

export function startBillingScheduler(): void {
  if (scheduledTask) {
    return;
  }

  void reconcileBillingSchedules().catch((error) => {
    console.error('Billing schedule reconciliation failed', error);
  });
  void reconcilePendingBillingAttempts().catch((error) => {
    console.error('Pending billing reconciliation failed', error);
  });

  // Hourly — daily plans must bill even if the server missed the 06:00 UTC window.
  scheduledTask = cron.schedule(
    '0 * * * *',
    () => {
      void processDueBillings().catch((error) => {
        console.error('Billing scheduler failed', error);
      });
    },
    { timezone: 'UTC' },
  );

  console.log('Billing scheduler started (hourly UTC)');
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
  await reconcileBillingSchedules();
  await reconcilePendingBillingAttempts();

  const start = startOfUtcDay(referenceDate);
  const end = endOfUtcDay(referenceDate);

  const dueContracts = await prisma.subscriptionContract.findMany({
    where: {
      status: ContractStatus.active,
      OR: [{ nextBillingDate: { lte: end } }, { nextBillingDate: null }],
    },
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;

  for (const row of dueContracts) {
    try {
      // Phase 1: bill every overdue cycle (next billing before start of today).
      let catchUpAttempts = 0;
      while (catchUpAttempts < MAX_CATCH_UP_ATTEMPTS) {
        const snapshot = await prisma.subscriptionContract.findUnique({
          where: { id: row.id },
          select: { status: true, nextBillingDate: true },
        });

        if (
          !snapshot ||
          snapshot.status !== ContractStatus.active ||
          !snapshot.nextBillingDate ||
          snapshot.nextBillingDate >= start
        ) {
          break;
        }

        const result = await attemptBilling(row.id, {
          bypassSchedule: true,
          scheduleFromDueDate: true,
        });
        catchUpAttempts += 1;

        if (result === 'success') {
          succeeded += 1;
          continue;
        }
        if (result === 'failed') {
          failed += 1;
        }
        break;
      }

      // Phase 2: bill if due today (including after catch-up lands on today).
      const current = await prisma.subscriptionContract.findUnique({
        where: { id: row.id },
        select: {
          status: true,
          nextBillingDate: true,
          lastBillingDate: true,
        },
      });

      if (
        !current ||
        current.status !== ContractStatus.active ||
        !current.nextBillingDate ||
        current.nextBillingDate > end
      ) {
        continue;
      }

      const billedToday =
        current.lastBillingDate != null &&
        current.lastBillingDate >= startOfUtcDay(referenceDate) &&
        current.lastBillingDate <= end;

      const result = await attemptBilling(row.id, {
        bypassSchedule: billedToday,
        scheduleFromDueDate: billedToday,
      });

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
  options?: { bypassSchedule?: boolean; scheduleFromDueDate?: boolean },
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

  // Wait for payment-link first invoice before scheduling renewals.
  if (contract.totalCharges === 0) {
    const pendingOrder = await prisma.subscriptionOrder.findFirst({
      where: {
        contractId: contract.id,
        status: OrderStatus.pending,
      },
      include: { contract: true },
    });
    if (pendingOrder?.contract) {
      const completed = await reconcilePendingSubscriptionOrderPayment(
        contract.shop,
        {
          id: pendingOrder.id,
          contractId: pendingOrder.contractId,
          customerId: pendingOrder.customerId,
          shopifyOrderId: pendingOrder.shopifyOrderId,
          totalPrice: pendingOrder.totalPrice,
          status: pendingOrder.status,
          contract: {
            id: pendingOrder.contract.id,
            shopifyContractId: pendingOrder.contract.shopifyContractId,
            billingPolicy: pendingOrder.contract.billingPolicy,
            totalCharges: pendingOrder.contract.totalCharges,
          },
        },
      );
      return completed ? 'success' : 'skipped';
    }
  }

  if (!contract.nextBillingDate) {
    const computed = initialNextBillingDate(contract);
    if (computed) {
      contract.nextBillingDate = computed;
      await prisma.subscriptionContract.update({
        where: { id: contract.id },
        data: { nextBillingDate: computed },
      });
    }
  }

  if (!options?.bypassSchedule && contract.nextBillingDate) {
    const end = endOfUtcDay();
    if (contract.nextBillingDate > end) {
      return 'skipped';
    }
  }

  if (
    contract.lastBillingAttemptId?.startsWith(
      'gid://shopify/SubscriptionBillingAttempt/',
    )
  ) {
    const pending = await fetchBillingAttempt(
      contract.shop,
      contract.lastBillingAttemptId,
    );
    if (pending?.order) {
      const existingOrder = await prisma.subscriptionOrder.findFirst({
        where: {
          shopId: contract.shopId,
          shopifyOrderId: pending.order.id,
        },
      });
      if (existingOrder) {
        return 'skipped';
      }
      await completeSuccessfulBilling(contract, pending, options);
      return 'success';
    }
  }

  // Idempotency: one scheduled attempt key per contract per UTC day.
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

  let resolvedAttempt = attempt;
  if (
    !resolvedAttempt.errorMessage &&
    !resolvedAttempt.errorCode &&
    !resolvedAttempt.order
  ) {
    resolvedAttempt =
      (await pollBillingAttemptUntilReady(contract.shop, resolvedAttempt.id)) ??
      resolvedAttempt;
  }

  if (resolvedAttempt.errorMessage || resolvedAttempt.errorCode) {
    await markPaymentFailed(
      contract.id,
      resolvedAttempt.errorMessage ??
        resolvedAttempt.errorCode ??
        'Billing attempt failed',
      resolvedAttempt.id,
      resolvedAttempt.errorCode ?? undefined,
    );
    return 'failed';
  }

  if (!resolvedAttempt.order) {
    return 'skipped';
  }

  await completeSuccessfulBilling(contract, resolvedAttempt, options);
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
