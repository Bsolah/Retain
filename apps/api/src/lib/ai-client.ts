import { env } from '../env.js';

export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

type AiFetchOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Default 15s; train should pass a longer timeout. */
  timeoutMs?: number;
};

async function aiFetch<T>(
  path: string,
  options: AiFetchOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const url = new URL(path, env.AI_SERVICE_URL);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'AI service unreachable';
    throw new AiServiceError(message, 503);
  }

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const detail = payload.detail ?? payload.message ?? payload.error;
    const message =
      typeof detail === 'string'
        ? detail
        : detail != null
          ? JSON.stringify(detail)
          : `AI service error ${response.status}`;
    throw new AiServiceError(message, response.status, payload);
  }

  return payload as T;
}

export type AiHealth = {
  status: string;
  service?: string;
  timestamp?: string;
};

export type AiFeaturesHealth = {
  status: string;
  database: string;
  redis: string;
  errors?: string[];
  timestamp?: string;
};

export type AiPipelineLastRun = {
  ran_at?: string;
  shops_processed?: number;
  contracts_scored?: number;
  interventions_created?: number;
  processing_time_ms?: number;
  error?: string;
} | null;

export async function getAiLiveness(): Promise<AiHealth> {
  return aiFetch<AiHealth>('/health', { timeoutMs: 5_000 });
}

export async function getAiFeaturesHealth(): Promise<AiFeaturesHealth> {
  return aiFetch<AiFeaturesHealth>('/features/health', { timeoutMs: 5_000 });
}

export async function getAiPipelineLastRun(): Promise<AiPipelineLastRun> {
  try {
    return await aiFetch<AiPipelineLastRun>('/pipeline/last', {
      timeoutMs: 5_000,
    });
  } catch {
    return null;
  }
}

export async function generateShopFeatures(shopId: string) {
  return aiFetch<Record<string, unknown>>('/features/generate', {
    method: 'POST',
    body: { shop_id: shopId },
    timeoutMs: 120_000,
  });
}

export async function trainModel(input: {
  shopId: string;
  retrainAll?: boolean;
  deploy?: boolean;
  rolloutPercentage?: number;
}) {
  return aiFetch<Record<string, unknown>>('/models/train', {
    method: 'POST',
    body: {
      shop_id: input.shopId,
      retrain_all: input.retrainAll ?? false,
      deploy: input.deploy ?? true,
      rollout_percentage: input.rolloutPercentage ?? 100,
    },
    timeoutMs: 600_000,
  });
}

export async function deployModel(
  version: string,
  input: { shopId?: string; rolloutPercentage?: number },
) {
  return aiFetch<Record<string, unknown>>(
    `/models/${encodeURIComponent(version)}/deploy`,
    {
      method: 'POST',
      body: {
        shop_id: input.shopId,
        rollout_percentage: input.rolloutPercentage ?? 100,
      },
      timeoutMs: 60_000,
    },
  );
}

export async function batchPredict(contractIds: string[]) {
  return aiFetch<{
    count: number;
    predictions: Array<Record<string, unknown>>;
  }>('/predictions/batch', {
    method: 'POST',
    body: { contract_ids: contractIds },
    timeoutMs: 300_000,
  });
}

export async function evaluateInterventionsBatch(shopId: string) {
  return aiFetch<Record<string, unknown>>('/interventions/evaluate-batch', {
    method: 'POST',
    body: { shop_id: shopId },
    timeoutMs: 300_000,
  });
}

export async function runShopPipeline(shopId: string) {
  return aiFetch<Record<string, unknown>>('/pipeline/run', {
    method: 'POST',
    body: { shop_id: shopId },
    timeoutMs: 600_000,
  });
}
