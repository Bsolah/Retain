type Closable = {
  close: () => Promise<unknown>;
};

const queueConnections: Closable[] = [];

/** Register BullMQ queues/workers so graceful shutdown can drain them. */
export function registerQueueForShutdown(connection: Closable): void {
  queueConnections.push(connection);
}

export async function drainQueues(): Promise<void> {
  await Promise.all(queueConnections.map((connection) => connection.close()));
  queueConnections.length = 0;
}
