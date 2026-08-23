const COMPLETION_STATES = new Set([
  'not_started', 'dispatched', 'transport_failed', 'http_rejected', 'http_200'
]);
const CREDENTIAL_STATES = new Set([
  'not_saved', 'save_failed', 'saved_not_signable', 'saved_signable'
]);
const FAILURE_PATTERN = /^pair-completion-(?:transport-failed|http-[0-9]{3}(?:-[a-z_]+)?)$/u;

function invalidEvidence() {
  throw new Error('Pair sync Android evidence is incomplete or contradictory.');
}

export function validatePairSyncAndroidEvidence(value) {
  if (!COMPLETION_STATES.has(value?.completion)
      || !CREDENTIAL_STATES.has(value?.credentials)
      || value?.initialSync !== 'not_started') invalidEvidence();
  if (value.completion !== 'http_200' && value.credentials !== 'not_saved') invalidEvidence();
  if (value.failure !== undefined && !FAILURE_PATTERN.test(value.failure)) invalidEvidence();
  return {
    completion: value.completion,
    credentials: value.credentials,
    initialSync: value.initialSync,
    ...(value.failure ? { failure: value.failure } : {})
  };
}

export function parseLatestPairSyncAndroidEvidence(output) {
  const prefix = 'INSTRUMENTATION_STATUS: foliolePairSyncEvidence=';
  const lines = String(output).split(/\r?\n/u).filter((line) => line.startsWith(prefix));
  if (lines.length === 0) return null;
  try { return validatePairSyncAndroidEvidence(JSON.parse(lines.at(-1).slice(prefix.length))); }
  catch { return null; }
}
