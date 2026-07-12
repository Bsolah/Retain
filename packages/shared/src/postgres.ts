export function validatePostgresUrl(input: string): string {
  const trimmed = input.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) {
    throw new Error(
      'DATABASE_URL is required. On Railway: add a Postgres plugin, link it to this service, then set DATABASE_URL=${{Postgres.DATABASE_URL}} (must start with postgresql:// or postgres://).',
    );
  }

  // Unresolved Railway reference variable (literal ${{...}} left in the value).
  if (trimmed.includes('${{') || trimmed.includes('}}')) {
    throw new Error(
      'DATABASE_URL looks like an unresolved Railway reference. Link the Postgres service and set DATABASE_URL=${{Postgres.DATABASE_URL}} (use the exact Postgres service name).',
    );
  }

  if (
    !trimmed.startsWith('postgresql://') &&
    !trimmed.startsWith('postgres://')
  ) {
    throw new Error(
      `DATABASE_URL must start with postgresql:// or postgres:// (got "${trimmed.slice(0, 48)}"). Do not use an https:// Railway domain — copy the Postgres plugin connection URL.`,
    );
  }

  const url = new URL(trimmed);
  if (!url.hostname) {
    throw new Error('DATABASE_URL must include a hostname.');
  }

  return trimmed;
}

/** Prefer explicit DATABASE_URL, then Railway private/public Postgres URLs. */
export function resolvePostgresUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const candidates = [
    env.DATABASE_URL,
    env.DATABASE_PRIVATE_URL,
    env.DATABASE_PUBLIC_URL,
    env.POSTGRES_URL,
    env.POSTGRES_PRIVATE_URL,
    env.POSTGRES_PUBLIC_URL,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    if (value.startsWith('postgresql://') || value.startsWith('postgres://')) {
      return value;
    }
  }

  return candidates.find((value) => value?.trim())?.trim();
}
