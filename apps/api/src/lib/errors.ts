import type { MercuriusContext } from 'mercurius';

export type FormattedGraphQLError = {
  message: string;
  code: string;
  extensions: Record<string, unknown>;
};

type GraphqlErrorLike = {
  message: string;
  extensions?: Record<string, unknown> | null;
};

type ExecutionResultLike = {
  data?: Record<string, unknown> | null;
  errors: readonly GraphqlErrorLike[];
};

export function formatGraphQLError(
  error: GraphqlErrorLike,
): FormattedGraphQLError {
  const extensions = { ...(error.extensions ?? {}) };
  const code =
    typeof extensions.code === 'string' && extensions.code.length > 0
      ? extensions.code
      : 'INTERNAL_SERVER_ERROR';

  extensions.code = code;

  return {
    message: error.message,
    code,
    extensions,
  };
}

export function mercuriusErrorFormatter(
  execution: ExecutionResultLike,
  _context: MercuriusContext,
): {
  statusCode: number;
  response: {
    data: Record<string, unknown> | null;
    errors: FormattedGraphQLError[];
  };
} {
  const errors = execution.errors.map(formatGraphQLError);

  return {
    statusCode: 200,
    // Mercurius accepts this shape at runtime; top-level `code` is intentional.
    response: {
      data: execution.data ?? null,
      errors,
    },
  } as {
    statusCode: number;
    response: {
      data: Record<string, unknown> | null;
      errors: FormattedGraphQLError[];
    };
  };
}
