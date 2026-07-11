import {
  ContractStatus,
  EventSource,
  prisma,
  type SubscriptionContract,
  type SubscriptionPlan,
} from '@retain/database';
import { userInputError, notFoundError } from '../lib/graphql-errors.js';
import { addInterval, asDeliveryPolicy } from './billing-policy.js';
import { attemptBilling } from './billing-scheduler.js';
import { logEvent } from './events.js';

type BoxItem = {
  productId: string;
  variantId: string;
  quantity: number;
  slot?: string | null;
};

type BoxConfig = {
  minItems?: number | null;
  maxItems?: number | null;
  allowSwaps?: boolean | null;
  slots?: Array<{ id: string; required?: boolean }> | null;
};

function asBoxConfig(value: unknown): BoxConfig {
  return value && typeof value === 'object' ? (value as BoxConfig) : {};
}

function asBoxItems(value: unknown): BoxItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      productId: String(row.productId ?? ''),
      variantId: String(row.variantId ?? ''),
      quantity: Number(row.quantity ?? 1),
      slot: row.slot == null ? null : String(row.slot),
    };
  });
}

async function loadContract(
  id: string,
): Promise<SubscriptionContract & { plan: SubscriptionPlan }> {
  const contract = await prisma.subscriptionContract.findUnique({
    where: { id },
    include: { plan: true },
  });
  if (!contract) {
    throw notFoundError('Contract not found');
  }
  return contract;
}

function validateBoxItems(plan: SubscriptionPlan, items: BoxItem[]): void {
  const config = asBoxConfig(plan.boxConfig);
  if (plan.planType !== 'box' && items.length === 0) {
    return;
  }

  if (config.minItems != null && items.length < config.minItems) {
    throw userInputError(
      `Box requires at least ${config.minItems} items (got ${items.length})`,
    );
  }
  if (config.maxItems != null && items.length > config.maxItems) {
    throw userInputError(
      `Box allows at most ${config.maxItems} items (got ${items.length})`,
    );
  }

  const slots = config.slots ?? [];
  if (slots.length > 0) {
    const used = new Set(
      items
        .map((item) => item.slot)
        .filter((slot): slot is string => Boolean(slot)),
    );
    for (const slot of slots) {
      if (slot.required && !used.has(slot.id)) {
        throw userInputError(`Missing required box slot: ${slot.id}`);
      }
    }
  }

  for (const item of items) {
    if (!item.productId || !item.variantId || item.quantity < 1) {
      throw userInputError(
        'Each box item needs productId, variantId, quantity',
      );
    }
  }
}

export async function updateContract(options: {
  id: string;
  input: {
    status?: string | null;
    nextBillingDate?: string | null;
    boxItems?: BoxItem[] | null;
    pauseDuration?: number | null;
  };
  actor: 'merchant' | 'customer' | 'system';
  merchantOverride?: boolean;
}): Promise<SubscriptionContract> {
  const contract = await loadContract(options.id);
  const data: Record<string, unknown> = {};

  if (options.input.status) {
    data.status = options.input.status;
  }

  if (options.input.nextBillingDate) {
    data.nextBillingDate = new Date(options.input.nextBillingDate);
  }

  if (options.input.boxItems) {
    validateBoxItems(contract.plan, options.input.boxItems);
    data.boxItems = options.input.boxItems as object;
  }

  if (options.input.pauseDuration != null) {
    const resumeDate = new Date();
    resumeDate.setUTCDate(
      resumeDate.getUTCDate() + options.input.pauseDuration,
    );
    data.status = ContractStatus.paused;
    data.resumeDate = resumeDate;
  }

  const updated = await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: data as object,
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.updated',
    eventSubtype: options.actor,
    payload: { input: options.input },
    source:
      options.actor === 'customer'
        ? EventSource.customer
        : EventSource.merchant,
  });

  return updated;
}

export async function cancelContract(options: {
  id: string;
  reason: string;
  notes?: string | null;
  feedback?: string | null;
  actor: 'merchant' | 'customer';
  merchantOverride?: boolean;
}): Promise<SubscriptionContract> {
  const contract = await loadContract(options.id);

  const updated = await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: {
      status: ContractStatus.cancelled,
      cancelledAt: new Date(),
      cancellationReason: options.reason,
      cancellationNotes: options.notes ?? options.feedback ?? null,
      resumeDate: null,
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.cancelled',
    eventSubtype: options.actor,
    payload: {
      reason: options.reason,
      notes: options.notes,
      feedback: options.feedback,
    },
    source:
      options.actor === 'customer'
        ? EventSource.customer
        : EventSource.merchant,
  });

  return updated;
}

export async function pauseContract(options: {
  id: string;
  durationDays: number;
  actor: 'merchant' | 'customer';
}): Promise<SubscriptionContract> {
  if (options.durationDays < 1 || options.durationDays > 365) {
    throw userInputError('Pause duration must be between 1 and 365 days');
  }

  const contract = await loadContract(options.id);
  if (contract.status === ContractStatus.cancelled) {
    throw userInputError('Cannot pause a cancelled contract');
  }

  const resumeDate = new Date();
  resumeDate.setUTCDate(resumeDate.getUTCDate() + options.durationDays);

  const updated = await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: {
      status: ContractStatus.paused,
      resumeDate,
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.paused',
    eventSubtype: options.actor,
    payload: { durationDays: options.durationDays, resumeDate },
    source:
      options.actor === 'customer'
        ? EventSource.customer
        : EventSource.merchant,
  });

  return updated;
}

export async function resumeContract(options: {
  id: string;
  actor: 'merchant' | 'customer' | 'system';
}): Promise<SubscriptionContract> {
  const contract = await loadContract(options.id);
  if (contract.status !== ContractStatus.paused) {
    throw userInputError('Only paused contracts can be resumed');
  }

  const billingPolicy = asDeliveryPolicy(contract.billingPolicy);
  const nextBillingDate = addInterval(new Date(), billingPolicy);

  const updated = await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: {
      status: ContractStatus.active,
      resumeDate: null,
      nextBillingDate,
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.resumed',
    eventSubtype: options.actor,
    payload: { nextBillingDate },
    source:
      options.actor === 'customer'
        ? EventSource.customer
        : options.actor === 'merchant'
          ? EventSource.merchant
          : EventSource.system,
  });

  return updated;
}

export async function skipNextDelivery(options: {
  id: string;
  actor: 'merchant' | 'customer';
}): Promise<SubscriptionContract> {
  const contract = await loadContract(options.id);

  if (contract.consecutiveSkips >= 2) {
    throw userInputError('Cannot skip more than 2 consecutive deliveries');
  }

  const deliveryPolicy = asDeliveryPolicy(contract.deliveryPolicy);
  const skips = Array.isArray(deliveryPolicy.skips)
    ? [...(deliveryPolicy.skips as unknown[])]
    : [];
  skips.push({
    skippedAt: new Date().toISOString(),
    actor: options.actor,
  });
  deliveryPolicy.skips = skips;
  deliveryPolicy.skipNext = true;

  const billingPolicy = asDeliveryPolicy(contract.billingPolicy);
  const base = contract.nextBillingDate ?? new Date();
  const nextBillingDate = addInterval(base, billingPolicy);

  const updated = await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: {
      deliveryPolicy: deliveryPolicy as object,
      nextBillingDate,
      consecutiveSkips: contract.consecutiveSkips + 1,
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.skipped',
    eventSubtype: options.actor,
    payload: { nextBillingDate, consecutiveSkips: updated.consecutiveSkips },
    source:
      options.actor === 'customer'
        ? EventSource.customer
        : EventSource.merchant,
  });

  return updated;
}

export async function swapProduct(options: {
  id: string;
  newProductId: string;
  newVariantId: string;
  actor: 'merchant' | 'customer';
}): Promise<SubscriptionContract> {
  const contract = await loadContract(options.id);
  const config = asBoxConfig(contract.plan.boxConfig);
  if (config.allowSwaps === false) {
    throw userInputError('Product swaps are not allowed on this plan');
  }

  const lineItems = asBoxItems(contract.lineItems);
  const nextLines =
    lineItems.length === 0
      ? [
          {
            productId: options.newProductId,
            variantId: options.newVariantId,
            quantity: 1,
          },
        ]
      : lineItems.map((item, index) =>
          index === 0
            ? {
                ...item,
                productId: options.newProductId,
                variantId: options.newVariantId,
              }
            : item,
        );

  const updated = await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: { lineItems: nextLines as object },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.product_swapped',
    eventSubtype: options.actor,
    payload: {
      newProductId: options.newProductId,
      newVariantId: options.newVariantId,
    },
    source:
      options.actor === 'customer'
        ? EventSource.customer
        : EventSource.merchant,
  });

  return updated;
}

export async function updateBoxItems(options: {
  id: string;
  items: BoxItem[];
  actor: 'merchant' | 'customer';
}): Promise<SubscriptionContract> {
  const contract = await loadContract(options.id);
  validateBoxItems(contract.plan, options.items);

  const updated = await prisma.subscriptionContract.update({
    where: { id: contract.id },
    data: {
      boxItems: options.items as object,
      lineItems: options.items as object,
    },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.box_updated',
    eventSubtype: options.actor,
    payload: { items: options.items },
    source:
      options.actor === 'customer'
        ? EventSource.customer
        : EventSource.merchant,
  });

  return updated;
}

export async function runNow(options: {
  id: string;
  actor: 'merchant' | 'system';
}): Promise<SubscriptionContract> {
  const contract = await loadContract(options.id);
  if (
    contract.status !== ContractStatus.active &&
    contract.status !== ContractStatus.payment_failed
  ) {
    throw userInputError(
      'Only active or payment_failed contracts can bill now',
    );
  }

  await attemptBilling(contract.id, { bypassSchedule: true });

  const updated = await prisma.subscriptionContract.findUniqueOrThrow({
    where: { id: contract.id },
  });

  await logEvent({
    shopId: contract.shopId,
    contractId: contract.id,
    eventType: 'subscription_contract.run_now',
    eventSubtype: options.actor,
    payload: {},
    source:
      options.actor === 'merchant' ? EventSource.merchant : EventSource.system,
  });

  return updated;
}
