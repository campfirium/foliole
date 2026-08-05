const COMPLETION_STATES = new Set([
  'not_started', 'dispatched', 'transport_failed', 'http_rejected', 'http_200', 'existing_pairing'
]);
const CREDENTIAL_STATES = new Set([
  'not_saved', 'save_failed', 'saved_not_signable', 'saved_signable'
]);
const INITIAL_SYNC_STATES = new Set(['not_started', 'started', 'failed', 'completed']);

function invalidEvidence() {
  throw new Error('Pair sync Android evidence is incomplete or contradictory.');
}

export function validatePairSyncAndroidEvidence(value) {
  if (!COMPLETION_STATES.has(value?.completion)
      || !CREDENTIAL_STATES.has(value?.credentials)
      || !INITIAL_SYNC_STATES.has(value?.initialSync)) invalidEvidence();
  if (value.completion !== 'http_200' && value.completion !== 'existing_pairing'
      && (value.credentials !== 'not_saved' || value.initialSync !== 'not_started')) invalidEvidence();
  if (value.credentials !== 'saved_signable' && value.initialSync !== 'not_started') invalidEvidence();
  return {
    completion: value.completion,
    credentials: value.credentials,
    initialSync: value.initialSync
  };
}

export function parseLatestPairSyncAndroidEvidence(output) {
  const prefix = 'INSTRUMENTATION_STATUS: foliolePairSyncEvidence=';
  const lines = String(output).split(/\r?\n/u).filter((line) => line.startsWith(prefix));
  if (lines.length === 0) return null;
  try { return validatePairSyncAndroidEvidence(JSON.parse(lines.at(-1).slice(prefix.length))); }
  catch { return null; }
}
