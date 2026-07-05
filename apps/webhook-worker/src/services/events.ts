import { EventSource, prisma } from '@retain/database';

export async function logEvent(options: {
  shopId: string;
  contractId?: string | null;
  eventType: string;
  eventSubtype?: string | null;
  payload?: Record<string, unknown>;
  source?: EventSource;
}): Promise<void> {
  await prisma.event.create({
    data: {
      shopId: options.shopId,
      contractId: options.contractId ?? null,
      eventType: options.eventType,
      eventSubtype: options.eventSubtype ?? null,
      payload: (options.payload ?? {}) as object,
      source: options.source ?? EventSource.webhook,
    },
  });
}
