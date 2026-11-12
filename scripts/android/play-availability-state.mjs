import { readMobileStatus } from '../mobile/mobile-candidate-phase.mjs';
import { openPlayEdit } from './play-edit-id.mjs';

const SNAPSHOT = 'Play snapshot: ';
const RESULT = 'Play availability: ';
const RESULTS = new Set(['checking', 'waiting', 'available', 'rejected', 'error']);

export async function readPlaySnapshot(github, id) {
  const { value = 'cleared' } = await readMobileStatus(github, id, SNAPSHOT);
  if (!['creating', 'cleared'].includes(value) && !openPlayEdit(value)) {
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
  if ((kind === 'snapshot' && !['creating', 'cleared'].includes(value) && !openPlayEdit(value)) ||
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

const PUBLIC = 'Play public status: ';
const PUBLIC_STATES = new Set(['available', 'in-review', 'verifying', 'rejected', 'unavailable']);

export async function readPlayPublicStatus(github, id) {
  const { value } = await readMobileStatus(github, id, PUBLIC);
  if (value !== undefined) {
    if (!PUBLIC_STATES.has(value)) throw new Error('Unknown Play public status');
    return value;
  }
  // Older checks stored only the successful rollout proof, without a public observation.
  const legacy = await readMobileStatus(github, id, RESULT, state => ['available', 'rejected'].includes(state));
  return legacy.value;
}

export async function writePlayPublicStatus(github, row, value) {
  if (!PUBLIC_STATES.has(value)) throw new Error('Unknown Play public status');
  const { value: previous } = await readMobileStatus(github, row.id, PUBLIC);
  if (previous === value) return;
  return github('POST', `deployments/${row.id}/statuses`, {
    state: 'pending', description: `${PUBLIC}${value}`, auto_inactive: false,
    log_url: `https://github.com/campfirium/foliole/actions/runs/${row.payload.runId}`
  });
}

export async function wasPlayPubliclyAvailable(github, id) {
  const { value } = await readMobileStatus(github, id, PUBLIC, status => status === 'available');
  if (value) return true;
  const legacy = await readMobileStatus(github, id, RESULT, status => status === 'available');
  return legacy.value === 'available';
}
