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

/**
 * A deliberate business-rule rejection (not a DB/driver failure) — e.g. the
 * Critical-project limit. Carries a `code` so a Server Action can react
 * specifically (e.g. show an override-confirmation step) rather than just
 * displaying the message as a generic error.
 */
export class BusinessRuleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

/** Thrown when a mutation targets a project (or other entity) that either
 * doesn't exist or doesn't belong to the caller's organization. Server
 * Actions map this to a generic "not found" — never confirming *which* of
 * the two it was, so it can't be used to probe for other orgs' project IDs. */
export class NotFoundError extends Error {
  constructor(message = 'Not found.') {
    super(message);
    this.name = 'NotFoundError';
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
