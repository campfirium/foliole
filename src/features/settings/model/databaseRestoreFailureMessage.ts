const UNKNOWN_RESTORE_FAILURE =
  'The backup could not be restored. Keep your backup files and restart Foliole before making more changes.';

// Preserve the service's data outcome together with its diagnostic reason.
const RESTORE_OUTCOMES = new Set([
  'The selected backup was not restored. Your current library is unchanged.',
  'The selected backup was not restored. Your current library has been restored.',
  'The selected backup was not restored, and Foliole could not reopen the current library. ' +
    'Keep your backup files and restart Foliole before making more changes.'
]);

export function readDatabaseRestoreFailureMessage(message: string) {
  const outcome = message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '').trim();
  const summary = outcome.split('\nReason: ')[0] ?? '';
  if (RESTORE_OUTCOMES.has(summary)) return outcome;
  return outcome ? `${UNKNOWN_RESTORE_FAILURE}\nReason: ${outcome}` : UNKNOWN_RESTORE_FAILURE;
}
