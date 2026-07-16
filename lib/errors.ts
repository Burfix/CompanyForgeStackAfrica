/**
 * Maps raw Postgres/Supabase errors to operator-safe messages.
 *
 * Rule: nothing from a database driver, stack trace, or third-party API
 * ever reaches a toast, page, or log a non-engineer will see. Every
 * repository/service call that can fail should route its error through
 * here before it's shown to a user.
 */

export class OperationalError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly recommendedAction?: string,
  ) {
    super(message);
    this.name = 'OperationalError';
  }
}

const POSTGRES_ERROR_MESSAGES: Record<string, string> = {
  '23505': 'That record already exists.',
  '23503': 'This action references something that no longer exists.',
  '42501': "You don't have permission to do that.",
  '22P02': 'That value is in the wrong format.',
};

interface PostgresLikeError {
  code?: string;
  message?: string;
}

/**
 * Converts any thrown error into an OperationalError with an operator-safe
 * message. Always log the original `cause` server-side for debugging —
 * never send it to the client.
 */
export function toOperationalError(error: unknown, fallback = 'Something went wrong. Please try again.'): OperationalError {
  const pgError = error as PostgresLikeError;

  const mappedMessage = pgError?.code ? POSTGRES_ERROR_MESSAGES[pgError.code] : undefined;
  if (mappedMessage) {
    return new OperationalError(mappedMessage, error);
  }

  return new OperationalError(fallback, error);
}
