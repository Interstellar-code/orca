/**
 * Runtime call failures where the request may have reached the host but its reply was lost, so a
 * write's outcome is unknown. Shared by the Jira and Dart write paths, which turn these into
 * "verify before retrying" errors.
 */
export const UNVERIFIED_WRITE_OUTCOME_CODES: readonly string[] = [
  'runtime_timeout',
  'runtime_connection_failed',
  'runtime_disconnected',
  'runtime_unavailable'
]
