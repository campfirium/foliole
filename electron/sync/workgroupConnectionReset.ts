/** A reset before a response completes can be retried only by an idempotent caller. */
export function isWorkgroupConnectionReset(error: unknown) {
  if (!(error instanceof Error) || error.message !== 'fetch failed') return false;
  const cause = error.cause;
  return cause instanceof Error &&
    ('code' in cause && cause.code === 'ECONNRESET' ||
      cause.message.includes('ECONNRESET'));
}
