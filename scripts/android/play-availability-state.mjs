import { readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';

const SNAPSHOT = 'Play snapshot: ';
const RESULT = 'Play availability: ';
const RESULTS = new Set(['checking', 'waiting', 'available', 'rejected', 'error']);

export async function readPlaySnapshot(github, id) {
  const { value = 'cleared' } = await readMobileStatus(github, id, SNAPSHOT);
  if (!['creating', 'cleared'].includes(value) && !/^open:[1-9]\d*$/u.test(value)) {
    throw new Error('Unknown Play snapshot requires reconciliation');
  }
  return value;
}

export async function readPlayAvailability(github, id) {
  const { value } = await readMobileStatus(github, id, RESULT);
  if (value !== undefined && !RESULTS.has(value)) throw new Error('Unknown Play availability result');
  return value;
}

export async function writePlayCheckStatus(github, row, kind, value) {
  const description = `${kind === 'snapshot' ? SNAPSHOT : RESULT}${value}`;
  if ((kind === 'snapshot' && !['creating', 'cleared'].includes(value) && !/^open:[1-9]\d*$/u.test(value)) ||
      (kind === 'result' && !RESULTS.has(value)) || !['snapshot', 'result'].includes(kind)) {
    throw new Error('Invalid Play availability checkpoint');
  }
  // This records only the Android check; the combined release gate owns final readiness.
  return github('POST', `deployments/${row.id}/statuses`, { state: 'pending', description, auto_inactive: false,
    log_url: `https://github.com/campfirium/foliole/actions/runs/${row.payload.runId}` });
}

export async function writePlayReviewStatus(github, row, lifecycle) {
  const prefix = 'Play review: ';
  const value = lifecycle.replace('RELEASE_LIFECYCLE_STATE_', '');
  const { value: previous } = await readMobileStatus(github, row.id, prefix);
  if (previous === value) return;
  return github('POST', `deployments/${row.id}/statuses`, { state: 'pending',
    description: `${prefix}${value}`, auto_inactive: false,
    log_url: `https://github.com/campfirium/foliole/actions/runs/${row.payload.runId}` });
}
