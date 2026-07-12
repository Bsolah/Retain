import { ApiError } from './api';
import { getShopDomain, resolveApiUrl, setSession } from './session';
import type {
  CommunicationTemplate,
  MigrationError,
  MigrationPlatform,
  MigrationProgress,
  MigrationRow,
  ValidationReport,
} from '../types/migrations';

const API_URL = resolveApiUrl();

async function mintToken(): Promise<string> {
  const shop = getShopDomain();
  if (!shop) throw new ApiError('Missing shop session', 'UNAUTHENTICATED');
  const response = await fetch(`${API_URL}/auth/session-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shop }),
  });
  const payload = (await response.json()) as {
    token?: string;
    shop?: { id: string; shopifyDomain: string };
    message?: string;
    code?: string;
  };
  if (!response.ok || !payload.token || !payload.shop) {
    throw new ApiError(
      payload.message ?? 'Unable to create session token',
      payload.code ?? 'UNAUTHENTICATED',
    );
  }
  setSession({
    token: payload.token,
    shopDomain: payload.shop.shopifyDomain,
    shopId: payload.shop.id,
  });
  return payload.token;
}

async function migrationFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await mintToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new ApiError(
      payload.message ?? 'Migration API request failed',
      payload.code ?? 'API_ERROR',
    );
  }
  return payload as T;
}

export async function fetchMigrations(): Promise<MigrationRow[]> {
  return migrationFetch('/migrations');
}

export async function discoverMigration(input: {
  platform: MigrationPlatform;
  apiKey?: string;
  apiSecret?: string;
  csvData?: string;
}): Promise<{
  migrationId: string;
  status: string;
  preview: MigrationRow['preview'];
}> {
  return migrationFetch('/migrations/discover', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function startMigrationSync(
  migrationId: string,
): Promise<{ ok: boolean }> {
  return migrationFetch('/migrations/sync', {
    method: 'POST',
    body: JSON.stringify({ migrationId }),
  });
}

export async function fetchMigrationProgress(
  migrationId: string,
): Promise<MigrationProgress> {
  return migrationFetch(`/migrations/${migrationId}/progress`);
}

export async function validateMigration(
  migrationId: string,
): Promise<ValidationReport> {
  return migrationFetch(`/migrations/${migrationId}/validate`);
}

export async function cutoverMigration(
  migrationId: string,
  cancelSourceOnCutover = false,
): Promise<{ ok: boolean }> {
  return migrationFetch(`/migrations/${migrationId}/cutover`, {
    method: 'POST',
    body: JSON.stringify({ cancelSourceOnCutover }),
  });
}

export async function rollbackMigration(
  migrationId: string,
): Promise<{ ok: boolean }> {
  return migrationFetch(`/migrations/${migrationId}/rollback`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchMigrationErrors(
  migrationId: string,
): Promise<MigrationError[]> {
  return migrationFetch(`/migrations/${migrationId}/errors`);
}

export async function retryMigrationRecord(
  migrationId: string,
  recordId: string,
): Promise<{ ok: boolean }> {
  return migrationFetch(`/migrations/${migrationId}/retry/${recordId}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function updateCommunicationTemplate(
  migrationId: string,
  template: CommunicationTemplate,
): Promise<CommunicationTemplate> {
  return migrationFetch(`/migrations/${migrationId}/communication-template`, {
    method: 'PUT',
    body: JSON.stringify(template),
  });
}

export function subscribeMigrationProgress(
  migrationId: string,
  onProgress: (progress: MigrationProgress) => void,
): () => void {
  let closed = false;
  let source: EventSource | null = null;

  void mintToken().then((token) => {
    if (closed) return;
    source = new EventSource(
      `${API_URL}/migrations/${migrationId}/stream?token=${encodeURIComponent(token)}`,
    );
    source.onmessage = (event) => {
      try {
        onProgress(JSON.parse(event.data) as MigrationProgress);
      } catch {
        // ignore malformed events
      }
    };
  });

  return () => {
    closed = true;
    source?.close();
  };
}
