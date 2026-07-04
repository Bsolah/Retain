import type { HealthStatus } from './types.js';

export function createHealthResponse(service: string): HealthStatus {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  };
}
