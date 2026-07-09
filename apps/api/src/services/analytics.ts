import { ContractStatus, prisma } from '@retain/database';
import { computeNextBillingDateFromPolicy } from '@retain/shopify-admin';

type ContractWhere = NonNullable<
  Parameters<typeof prisma.subscriptionContract.findMany>[0]
>['where'];

export type DateRangeKey = '7d' | '30d' | '90d' | 'ytd' | 'custom';

export type AnalyticsRange = {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
};

export function resolveRange(
  range: DateRangeKey,
  customStart?: string,
  customEnd?: string,
): AnalyticsRange {
  const end = customEnd ? new Date(customEnd) : new Date();
  end.setUTCHours(23, 59, 59, 999);

  let start: Date;
  if (range === 'custom' && customStart) {
    start = new Date(customStart);
  } else if (range === '7d') {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
  } else if (range === '90d') {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 90);
  } else if (range === 'ytd') {
    start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  } else {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
  }
  start.setUTCHours(0, 0, 0, 0);

  const durationMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);

  return { start, end, previousStart, previousEnd };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eachDay(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (cursor <= last) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const ACTIVE: ContractStatus[] = [
  ContractStatus.active,
  ContractStatus.paused,
  ContractStatus.payment_failed,
];

export async function getDashboardOverview(
  shopId: string,
  range: AnalyticsRange,
  growthDays: 30 | 90 | 365 = 30,
) {
  const [
    activeNow,
    activePrevious,
    cancelledInRange,
    activeAtStart,
    customers,
    newThisMonth,
    ordersThisMonth,
    interventionsSent,
    interventionsAccepted,
    revenueSaved,
    contractsForMrr,
    ordersInRange,
    interventionsByType,
    cancelledVoluntary,
    cancelledInvoluntary,
  ] = await Promise.all([
    prisma.subscriptionContract.count({
      where: { shopId, status: { in: ACTIVE } },
    }),
    prisma.subscriptionContract.count({
      where: {
        shopId,
        status: { in: ACTIVE },
        createdAt: { lte: range.previousEnd },
        OR: [{ cancelledAt: null }, { cancelledAt: { gt: range.previousEnd } }],
      },
    }),
    prisma.subscriptionContract.count({
      where: {
        shopId,
        status: ContractStatus.cancelled,
        cancelledAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.subscriptionContract.count({
      where: {
        shopId,
        createdAt: { lte: range.start },
        OR: [{ cancelledAt: null }, { cancelledAt: { gt: range.start } }],
      },
    }),
    prisma.customer.aggregate({
      where: { shopId },
      _avg: { lifetimeValue: true },
    }),
    prisma.subscriptionContract.count({
      where: {
        shopId,
        createdAt: { gte: startOfMonth(range.end), lte: range.end },
      },
    }),
    prisma.subscriptionOrder.aggregate({
      where: {
        shopId,
        createdAt: { gte: startOfMonth(range.end), lte: range.end },
      },
      _sum: { totalPrice: true },
    }),
    prisma.intervention.count({
      where: {
        shopId,
        sentAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.intervention.count({
      where: {
        shopId,
        status: 'accepted',
        respondedAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.intervention.aggregate({
      where: {
        shopId,
        outcome: 'saved',
        respondedAt: { gte: range.start, lte: range.end },
      },
      _sum: { revenueImpact: true },
    }),
    prisma.subscriptionContract.findMany({
      where: { shopId, status: { in: ACTIVE } },
      select: {
        totalRevenue: true,
        totalCharges: true,
        pricingPolicy: true,
      },
    }),
    prisma.subscriptionOrder.findMany({
      where: {
        shopId,
        createdAt: { gte: range.start, lte: range.end },
      },
      select: { createdAt: true, totalPrice: true },
    }),
    prisma.intervention.groupBy({
      by: ['interventionType'],
      where: {
        shopId,
        sentAt: { gte: range.start, lte: range.end },
      },
      _count: { _all: true },
    }),
    prisma.subscriptionContract.count({
      where: {
        shopId,
        status: ContractStatus.cancelled,
        cancelledAt: { gte: range.start, lte: range.end },
        cancellationReason: { not: 'payment_failed' },
      },
    }),
    prisma.subscriptionContract.count({
      where: {
        shopId,
        status: ContractStatus.cancelled,
        cancelledAt: { gte: range.start, lte: range.end },
        cancellationReason: 'payment_failed',
      },
    }),
  ]);

  const mrr = contractsForMrr.reduce((sum, contract) => {
    const charges = Math.max(contract.totalCharges, 1);
    const avg = Number(contract.totalRevenue) / charges;
    return sum + (Number.isFinite(avg) ? avg : 0);
  }, 0);

  const previousCancelled = await prisma.subscriptionContract.count({
    where: {
      shopId,
      status: ContractStatus.cancelled,
      cancelledAt: { gte: range.previousStart, lte: range.previousEnd },
    },
  });
  const previousActiveStart = await prisma.subscriptionContract.count({
    where: {
      shopId,
      createdAt: { lte: range.previousStart },
      OR: [{ cancelledAt: null }, { cancelledAt: { gt: range.previousStart } }],
    },
  });

  const churnRate =
    activeAtStart > 0 ? (cancelledInRange / activeAtStart) * 100 : 0;
  const previousChurnRate =
    previousActiveStart > 0
      ? (previousCancelled / previousActiveStart) * 100
      : 0;

  const acceptanceRate =
    interventionsSent > 0
      ? (interventionsAccepted / interventionsSent) * 100
      : 0;

  const growthEnd = new Date(range.end);
  const growthStart = new Date(growthEnd);
  growthStart.setUTCDate(growthStart.getUTCDate() - growthDays);
  growthStart.setUTCHours(0, 0, 0, 0);
  const growthDayKeys = eachDay(growthStart, growthEnd);

  const days = eachDay(range.start, range.end);
  const createdByDay = await prisma.subscriptionContract.groupBy({
    by: ['createdAt'],
    where: {
      shopId,
      createdAt: { gte: range.start, lte: range.end },
    },
    _count: { _all: true },
  });

  // Build cumulative subscriber growth from daily creates/cancels.
  const creates = await prisma.subscriptionContract.findMany({
    where: { shopId, createdAt: { lte: range.end } },
    select: { createdAt: true, cancelledAt: true },
  });

  const cancelledContracts = await prisma.subscriptionContract.findMany({
    where: {
      shopId,
      status: ContractStatus.cancelled,
      cancelledAt: { gte: range.start, lte: range.end },
    },
    select: { cancelledAt: true, cancellationReason: true },
  });

  const churnTrend = days.map((day) => {
    const dayCancels = cancelledContracts.filter(
      (c) => c.cancelledAt && dayKey(c.cancelledAt) === day,
    );
    const involuntary = dayCancels.filter(
      (c) => c.cancellationReason === 'payment_failed',
    ).length;
    const voluntary = dayCancels.length - involuntary;
    return { date: day, voluntary, involuntary };
  });

  const subscriberGrowth = growthDayKeys.map((day) => {
    const at = new Date(`${day}T23:59:59.999Z`);
    const active = creates.filter(
      (c) => c.createdAt <= at && (!c.cancelledAt || c.cancelledAt > at),
    ).length;
    return { date: day, subscribers: active };
  });

  const revenueByDayMap = new Map<string, number>();
  for (const order of ordersInRange) {
    const key = dayKey(order.createdAt);
    revenueByDayMap.set(
      key,
      (revenueByDayMap.get(key) ?? 0) + Number(order.totalPrice),
    );
  }

  const mrrTrend = days.map((day) => {
    const at = new Date(`${day}T23:59:59.999Z`);
    const activeCount = creates.filter(
      (c) => c.createdAt <= at && (!c.cancelledAt || c.cancelledAt > at),
    ).length;
    const estimatedMrr =
      activeNow > 0 ? (mrr / activeNow) * activeCount : activeCount * 0;
    return {
      date: day,
      mrr: Number(estimatedMrr.toFixed(2)),
      churned: creates.filter(
        (c) => c.cancelledAt && dayKey(c.cancelledAt) === day,
      ).length,
    };
  });

  const plans = await prisma.subscriptionPlan.findMany({
    where: { shopId },
    select: {
      id: true,
      name: true,
      planType: true,
      contracts: {
        where: { status: { in: ACTIVE } },
        select: { totalRevenue: true },
      },
    },
  });

  const revenueByPlanType = Object.values(
    plans.reduce<Record<string, { name: string; value: number }>>(
      (acc, plan) => {
        const key = plan.planType;
        const revenue = plan.contracts.reduce(
          (sum, c) => sum + Number(c.totalRevenue),
          0,
        );
        acc[key] = acc[key] ?? { name: key, value: 0 };
        acc[key].value += revenue;
        return acc;
      },
      {},
    ),
  );

  const acceptedByType = await prisma.intervention.groupBy({
    by: ['interventionType'],
    where: {
      shopId,
      status: 'accepted',
      respondedAt: { gte: range.start, lte: range.end },
    },
    _count: { _all: true },
  });

  const acceptedMap = new Map(
    acceptedByType.map((row) => [row.interventionType, row._count._all]),
  );

  const topInterventions = interventionsByType.map((row) => ({
    type: row.interventionType,
    sent: row._count._all,
    accepted: acceptedMap.get(row.interventionType) ?? 0,
  }));

  const monthStart = startOfMonth(range.end);
  const newSubscriberSparkline = eachDay(monthStart, range.end).map((day) => ({
    date: day,
    count: creates.filter((c) => dayKey(c.createdAt) === day).length,
  }));

  void createdByDay;

  return {
    metrics: {
      activeSubscribers: {
        value: activeNow,
        changePct: pctChange(activeNow, activePrevious),
      },
      mrr: {
        value: Number(mrr.toFixed(2)),
        changePct: pctChange(
          mrr,
          mrr * (activePrevious / Math.max(activeNow, 1)),
        ),
      },
      arr: {
        value: Number((mrr * 12).toFixed(2)),
        changePct: pctChange(
          mrr,
          mrr * (activePrevious / Math.max(activeNow, 1)),
        ),
      },
      churnRate: {
        value: Number(churnRate.toFixed(2)),
        changePct: pctChange(churnRate, previousChurnRate),
      },
      ltv: {
        value: Number(customers._avg.lifetimeValue ?? 0),
        changePct: 0,
      },
      newSubscribersThisMonth: {
        value: newThisMonth,
        sparkline: newSubscriberSparkline,
      },
      revenueThisMonth: {
        value: Number(ordersThisMonth._sum.totalPrice ?? 0),
      },
      interventionsSent: { value: interventionsSent },
      interventionsAccepted: {
        value: interventionsAccepted,
        acceptanceRate: Number(acceptanceRate.toFixed(1)),
      },
      revenueSaved: {
        value: Number(revenueSaved._sum.revenueImpact ?? 0),
      },
    },
    charts: {
      subscriberGrowth,
      mrrTrend,
      churnTrend,
      revenueByPlanType,
      topInterventions,
      cancelledVoluntary,
      cancelledInvoluntary,
    },
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    growthDays,
  };
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export type CohortFilters = {
  channel?: string;
  product?: string;
  geography?: string;
  discount?: string;
};

function pseudoChannel(contractId: string): string {
  const channels = ['organic', 'paid', 'referral'];
  const hash = contractId
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return channels[hash % channels.length]!;
}

function pseudoGeography(email: string): string {
  const tld = email.split('.').pop()?.toLowerCase();
  if (tld === 'ca') return 'CA';
  if (tld === 'uk' || tld === 'co') return 'UK';
  if (tld === 'com' || tld === 'us') return 'US';
  return 'Other';
}

function planHasDiscount(frequencies: unknown): boolean {
  if (!Array.isArray(frequencies)) return false;
  return frequencies.some(
    (row) =>
      Number((row as { discountPercent?: number }).discountPercent ?? 0) > 0,
  );
}

export async function getCohortAnalysis(
  shopId: string,
  filters: CohortFilters = {},
) {
  const contracts = await prisma.subscriptionContract.findMany({
    where: { shopId },
    select: {
      id: true,
      createdAt: true,
      cancelledAt: true,
      status: true,
      totalRevenue: true,
      customer: { select: { lifetimeValue: true, email: true } },
      plan: {
        select: {
          name: true,
          productIds: true,
          frequencies: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const filtered = contracts.filter((contract) => {
    if (filters.channel && filters.channel !== 'all') {
      if (pseudoChannel(contract.id) !== filters.channel) return false;
    }
    if (filters.product && filters.product !== 'all') {
      const firstProduct = contract.plan.productIds[0];
      if (firstProduct !== filters.product) return false;
    }
    if (filters.geography && filters.geography !== 'all') {
      if (pseudoGeography(contract.customer.email) !== filters.geography) {
        return false;
      }
    }
    if (filters.discount && filters.discount !== 'all') {
      const hasDiscount = planHasDiscount(contract.plan.frequencies);
      if (filters.discount === 'with_discount' && !hasDiscount) return false;
      if (filters.discount === 'without_discount' && hasDiscount) return false;
    }
    return true;
  });

  const cohorts = new Map<
    string,
    {
      month: string;
      size: number;
      retention: number[];
      ltv: number;
      cacPayback: number | null;
    }
  >();

  for (const contract of filtered) {
    const month = contract.createdAt.toISOString().slice(0, 7);
    const cohort = cohorts.get(month) ?? {
      month,
      size: 0,
      retention: Array.from({ length: 13 }, () => 0),
      ltv: 0,
      cacPayback: null,
    };
    cohort.size += 1;
    cohort.ltv += Number(
      contract.customer.lifetimeValue ?? contract.totalRevenue,
    );

    for (let m = 0; m <= 12; m += 1) {
      const checkpoint = new Date(contract.createdAt);
      checkpoint.setUTCMonth(checkpoint.getUTCMonth() + m);
      if (checkpoint > new Date()) break;
      const stillActive =
        !contract.cancelledAt || contract.cancelledAt > checkpoint;
      if (stillActive) {
        cohort.retention[m] = (cohort.retention[m] ?? 0) + 1;
      }
    }
    cohorts.set(month, cohort);
  }

  return {
    cohorts: [...cohorts.values()].map((cohort) => ({
      month: cohort.month,
      size: cohort.size,
      ltv: cohort.size > 0 ? Number((cohort.ltv / cohort.size).toFixed(2)) : 0,
      cacPaybackMonths:
        cohort.size > 0
          ? Number(
              (
                cohort.ltv /
                cohort.size /
                Math.max(cohort.ltv / cohort.size / 12, 1)
              ).toFixed(1),
            )
          : null,
      retention: cohort.retention.map((count) =>
        cohort.size > 0 ? Number(((count / cohort.size) * 100).toFixed(1)) : 0,
      ),
    })),
    filters: {
      channels: ['organic', 'paid', 'referral'],
      products: [
        ...new Set(contracts.flatMap((c) => c.plan.productIds.slice(0, 1))),
      ],
      geographies: ['US', 'CA', 'UK', 'Other'],
      discounts: [
        { label: 'All', value: 'all' },
        { label: 'With discount', value: 'with_discount' },
        { label: 'Without discount', value: 'without_discount' },
      ],
    },
  };
}

export type SubscriberFilters = {
  search?: string;
  statuses?: string[];
  riskLevels?: string[];
  planId?: string;
  frequency?: string;
  nextChargeFrom?: string;
  nextChargeTo?: string;
  limit?: number;
  offset?: number;
};

export async function listSubscribers(
  shopId: string,
  filters: SubscriberFilters,
) {
  const where: ContractWhere = { shopId };

  if (filters.statuses?.length) {
    where.status = { in: filters.statuses as ContractStatus[] };
  }
  if (filters.planId) {
    where.planId = filters.planId;
  }
  if (filters.nextChargeFrom || filters.nextChargeTo) {
    where.nextBillingDate = {};
    if (filters.nextChargeFrom) {
      where.nextBillingDate.gte = new Date(filters.nextChargeFrom);
    }
    if (filters.nextChargeTo) {
      where.nextBillingDate.lte = new Date(filters.nextChargeTo);
    }
  }
  if (filters.riskLevels?.length) {
    where.healthStatus = { in: filters.riskLevels as never[] };
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { shopifyContractId: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
      { customer: { email: { contains: q, mode: 'insensitive' } } },
      { customer: { firstName: { contains: q, mode: 'insensitive' } } },
      { customer: { lastName: { contains: q, mode: 'insensitive' } } },
      {
        orders: {
          some: {
            OR: [
              { orderNumber: { contains: q, mode: 'insensitive' } },
              { shopifyOrderId: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  if (filters.frequency) {
    // Applied in-memory after fetch because delivery_policy shape varies.
  }

  const limit = Math.min(filters.limit ?? 50, 500);
  const offset = filters.offset ?? 0;

  const [total, rows] = await Promise.all([
    prisma.subscriptionContract.count({ where }),
    prisma.subscriptionContract.findMany({
      where,
      include: {
        customer: true,
        plan: { select: { id: true, name: true, planType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.frequency ? 500 : limit,
      skip: filters.frequency ? 0 : offset,
    }),
  ]);

  const filteredRows = filters.frequency
    ? rows.filter(
        (row) => formatFrequency(row.deliveryPolicy) === filters.frequency,
      )
    : rows;

  const pagedRows = filters.frequency
    ? filteredRows.slice(offset, offset + limit)
    : filteredRows;

  const resolvedTotal = filters.frequency ? filteredRows.length : total;

  return {
    total: resolvedTotal,
    limit,
    offset,
    subscribers: pagedRows.map((row) => ({
      id: row.id,
      shopifyContractId: row.shopifyContractId,
      status: row.status,
      healthStatus: row.healthStatus,
      riskScore: row.churnRiskScore ?? row.predictedChurn30d ?? 0,
      nextBillingDate: resolveSubscriberNextBillingDate(row),
      totalRevenue: Number(row.totalRevenue),
      plan: row.plan,
      customer: {
        id: row.customer.id,
        email: row.customer.email,
        firstName: row.customer.firstName,
        lastName: row.customer.lastName,
        phone: row.customer.phone,
        lifetimeValue: Number(row.customer.lifetimeValue),
      },
      frequency: formatFrequency(row.deliveryPolicy),
      createdAt: row.createdAt,
    })),
  };
}

function resolveSubscriberNextBillingDate(row: {
  nextBillingDate: Date | null;
  billingPolicy: unknown;
  lastBillingDate: Date | null;
  createdAt: Date;
  status: ContractStatus;
}): Date | null {
  if (row.nextBillingDate) return row.nextBillingDate;
  if (
    row.status === ContractStatus.cancelled ||
    row.status === ContractStatus.expired
  ) {
    return null;
  }
  const base = row.lastBillingDate ?? row.createdAt;
  return computeNextBillingDateFromPolicy(row.billingPolicy, base);
}

function formatFrequency(policy: unknown): string {
  if (!policy || typeof policy !== 'object') return '—';
  const record = policy as Record<string, unknown>;

  let count: number | null = null;
  let unit: string | null = null;

  if (record.intervalCount != null) {
    count = Number(record.intervalCount);
    unit = String(
      record.intervalUnit ?? record.interval ?? 'month',
    ).toLowerCase();
  } else if (typeof record.interval === 'number') {
    count = record.interval;
    unit = String(record.unit ?? record.intervalUnit ?? 'month').toLowerCase();
  }

  if (count == null || !Number.isFinite(count) || count <= 0 || !unit) {
    return '—';
  }

  // Match admin filter labels (e.g. "Every 1 month", "Every 2 week").
  return `Every ${count} ${unit}`;
}

export async function getSubscriberDetail(shopId: string, contractId: string) {
  const contract = await prisma.subscriptionContract.findFirst({
    where: { id: contractId, shopId },
    include: {
      customer: true,
      plan: true,
      interventions: { orderBy: { createdAt: 'desc' }, take: 50 },
      events: { orderBy: { createdAt: 'desc' }, take: 100 },
      signals: { take: 1, orderBy: { calculatedAt: 'desc' } },
    },
  });

  if (!contract) return null;

  const signal = contract.signals[0];
  const featureVector =
    (signal?.featureVector as Record<string, number> | null) ?? {};

  const riskFactors = Object.entries(featureVector)
    .filter(([, value]) => typeof value === 'number')
    .map(([feature, value]) => ({
      feature,
      value,
      contribution: Math.min(Math.abs(Number(value)) / 10, 1),
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  const notes = contract.events
    .filter((event) => event.eventType === 'merchant.note')
    .map((event) => ({
      id: event.id,
      note: (event.payload as { note?: string }).note ?? '',
      createdAt: event.createdAt,
    }));

  return {
    id: contract.id,
    status: contract.status,
    healthStatus: contract.healthStatus,
    riskScore: contract.churnRiskScore ?? contract.predictedChurn30d ?? 0,
    nextBillingDate: resolveSubscriberNextBillingDate(contract),
    totalRevenue: Number(contract.totalRevenue),
    createdAt: contract.createdAt,
    plan: contract.plan,
    customer: {
      id: contract.customer.id,
      email: contract.customer.email,
      firstName: contract.customer.firstName,
      lastName: contract.customer.lastName,
      phone: contract.customer.phone,
      lifetimeValue: Number(contract.customer.lifetimeValue),
      address: null as string | null,
    },
    frequency: formatFrequency(contract.deliveryPolicy),
    tenureDays: Math.max(
      0,
      Math.floor(
        (Date.now() - contract.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    ),
    timeline: contract.events.map((event) => ({
      id: event.id,
      type: event.eventType,
      subtype: event.eventSubtype,
      payload: event.payload,
      createdAt: event.createdAt,
    })),
    riskFactors,
    interventions: contract.interventions.map((item) => ({
      id: item.id,
      type: item.interventionType,
      status: item.status,
      outcome: item.outcome,
      subject: item.messageSubject,
      revenueImpact: item.revenueImpact ? Number(item.revenueImpact) : null,
      createdAt: item.createdAt,
      respondedAt: item.respondedAt,
    })),
    notes,
  };
}

export async function getAiPerformance(shopId: string) {
  const models = await prisma.modelRegistry.findMany({
    where: {
      OR: [{ shopId }, { shopId: null }],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const active = models.find((model) => model.isActive) ?? models[0];
  const metrics = (active?.metrics ?? {}) as Record<string, number>;

  const interventions = await prisma.intervention.groupBy({
    by: ['interventionType', 'status'],
    where: { shopId },
    _count: { _all: true },
  });

  const byType = new Map<string, { sent: number; accepted: number }>();
  for (const row of interventions) {
    const current = byType.get(row.interventionType) ?? {
      sent: 0,
      accepted: 0,
    };
    if (row.status !== 'pending') current.sent += row._count._all;
    if (row.status === 'accepted') current.accepted += row._count._all;
    byType.set(row.interventionType, current);
  }

  const revenueSaved = await prisma.intervention.aggregate({
    where: { shopId, outcome: 'saved' },
    _sum: { revenueImpact: true },
  });

  const modelMetrics = (active?.metrics ?? {}) as Record<string, unknown>;
  const storedImportance = modelMetrics.featureImportance;
  const featureImportance = Array.isArray(storedImportance)
    ? (storedImportance as Array<{ feature: string; importance: number }>)
    : [
        'payment_failure_count_30d',
        'cadence_drift_days',
        'skip_count_90d',
        'days_since_last_engagement',
        'support_ticket_sentiment',
        'portal_login_count_30d',
        'pause_count_lifetime',
        'product_swap_count_30d',
      ].map((feature, index) => ({
        feature,
        importance: Number((0.22 - index * 0.02).toFixed(3)),
      }));

  return {
    activeModel: active
      ? {
          version: active.version,
          path: active.path,
          isActive: active.isActive,
          rolloutPercentage: active.rolloutPercentage,
          metrics: {
            precision: metrics.precision ?? 0,
            recall: metrics.recall ?? 0,
            f1: metrics.f1 ?? 0,
            auc: metrics.auc ?? 0,
          },
          createdAt: active.createdAt,
        }
      : null,
    interventionSuccess: [...byType.entries()].map(([type, stats]) => ({
      type,
      sent: stats.sent,
      accepted: stats.accepted,
      successRate:
        stats.sent > 0
          ? Number(((stats.accepted / stats.sent) * 100).toFixed(1))
          : 0,
    })),
    revenueSaved: Number(revenueSaved._sum.revenueImpact ?? 0),
    featureImportance,
    modelHistory: models.map((model) => ({
      version: model.version,
      isActive: model.isActive,
      rolloutPercentage: model.rolloutPercentage,
      metrics: model.metrics,
      createdAt: model.createdAt,
      path: model.path,
    })),
  };
}
