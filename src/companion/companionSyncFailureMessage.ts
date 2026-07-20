export function formatCompanionSyncFailureMessage(error: unknown) {
  const message = normalizeCompanionSyncErrorMessage(error);
  if (/connection foliole-companion .*does not exist/i.test(message) ||
    /connection foliole-companion .*already exists/i.test(message)) {
    return 'The device sync database connection was reset. Sync will retry.';
  }
  if (message.includes('Failed to apply companion desktop sync pack.')) {
    const cause = message.replace('Failed to apply companion desktop sync pack.', '').trim();
    return `Topic list sync failed: ${cause || 'This device could not apply the desktop sync pack.'}`;
  }
  if (message.includes('applying the structure pack')) {
    return `Topic list sync failed: ${message}`;
  }
  if (message.includes('fetching body downloads') || message.includes('fetching topic bodies')) {
    return `Body download sync failed: ${message}`;
  }
  if (message.includes('fetching attachment resources')) {
    return `Attachment file sync failed: ${message}`;
  }
  if (message.includes('pushing local review changes')) {
    return `Local change upload failed: ${message}`;
  }
  return message;
}

function normalizeCompanionSyncErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (hasMessage(error)) {
    const message = error.message.trim();
    if (message) return message;
  }
  return 'Desktop sync failed: no error details were returned.';
}

function hasMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string';
}
