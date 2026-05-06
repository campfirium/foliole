export function formatCompanionSyncFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Desktop sync failed.';
  if (message.includes('Failed to apply companion desktop sync pack.')) {
    const cause = message.replace('Failed to apply companion desktop sync pack.', '').trim();
    return `Topic list sync failed: ${cause || 'Android could not apply the desktop sync pack.'}`;
  }
  if (message.includes('applying the structure pack')) {
    return `Topic list sync failed: ${message}`;
  }
  if (message.includes('fetching topic bodies')) {
    return `Topic body sync failed: ${message}`;
  }
  if (message.includes('fetching attachment resources')) {
    return `Attachment file sync failed: ${message}`;
  }
  if (message.includes('pushing local review changes')) {
    return `Local change upload failed: ${message}`;
  }
  return message;
}
