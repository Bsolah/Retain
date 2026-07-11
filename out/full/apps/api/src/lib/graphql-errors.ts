type GraphQlAppError = Error & {
  extensions: Record<string, unknown>;
};

function appError(
  message: string,
  code: string,
  extensions?: Record<string, unknown>,
): GraphQlAppError {
  const error = new Error(message) as GraphQlAppError;
  error.extensions = { code, ...extensions };
  return error;
}

export function userInputError(
  message: string,
  extensions?: Record<string, unknown>,
): Error {
  return appError(message, 'BAD_USER_INPUT', extensions);
}

export function unauthenticatedError(
  message = 'Authentication required',
): Error {
  return appError(message, 'UNAUTHENTICATED');
}

export function forbiddenError(message = 'Forbidden'): Error {
  return appError(message, 'FORBIDDEN');
}

export function notFoundError(message: string): Error {
  return appError(message, 'NOT_FOUND');
}
