import { openPlayEdit } from '../android/play-edit-id.mjs';

const PHASES = new Set(['upload-unknown', 'uploaded', 'commit-unknown', 'committed', 'observed']);
const PREFIX = 'Play candidate: ';

export async function readMobileStatus(api, id, prefix, include = () => true) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('A durable candidate ID is required');
  let hasHistory = false;
  let latest;
  for (let page = 1; ; page += 1) {
    const rows = await api('GET', `deployments/${id}/statuses?per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error('Durable mobile operation history is unavailable');
    hasHistory ||= rows.length > 0;
    latest ??= rows[0];
    const row = rows.find(item => item.description?.startsWith(prefix) && include(item.description.slice(prefix.length)));
    if (row) {
      if (row.creator?.login !== 'github-actions[bot]') throw new Error('Durable mobile operation identity differs');
      return { value: row.description.slice(prefix.length), hasHistory, status: row, latest };
    }
    if (rows.length < 100) return { value: undefined, hasHistory, latest };
  }
}

// GitHub keeps at most 100 statuses per deployment; the 101st write fails with HTTP 422.
const DEPLOYMENT_STATUS_LIMIT = 100;

export async function requireDeploymentStatusBudget(api, id, needed, operation) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('A durable candidate ID is required');
  let used = 0;
  for (let page = 1; ; page += 1) {
    const rows = await api('GET', `deployments/${id}/statuses?per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error('Durable mobile operation history is unavailable');
    used += rows.length;
    if (rows.length < 100) break;
  }
  if (used + needed <= DEPLOYMENT_STATUS_LIMIT) return used;
  const error = new Error(`Deployment ${id} already has ${used} of ${DEPLOYMENT_STATUS_LIMIT} GitHub statuses; ` +
    `${operation} needs ${needed} more, so no Play edit was created. Reconcile this deployment before retrying`);
  error.statusBudgetExhausted = true;
  throw error;
}

export async function readMobileCandidatePhase(api, id) {
  const { value, hasHistory } = await readMobileStatus(api, id, PREFIX);
  if (value === undefined) {
    const edit = await readMobileStatus(api, id, 'Play upload edit: ');
    if (edit.value === 'creating' || openPlayEdit(edit.value)) return 'signed';
    if (hasHistory) throw new Error('Unknown mobile operation history requires reconciliation');
    return 'signed';
  }
  if (!PHASES.has(value)) throw new Error('Durable mobile operation identity differs');
  return value;
}

export async function writeMobileCandidatePhase(api, id, candidate) {
  if (!Number.isSafeInteger(id) || id < 1 || !PHASES.has(candidate.phase)) throw new Error('Invalid durable Play operation');
  return api('POST', `deployments/${id}/statuses`, { state: candidate.phase === 'observed' ? 'pending' : 'in_progress',
    description: `${PREFIX}${candidate.phase}`, auto_inactive: false,
    log_url: `https://github.com/campfirium/foliole/actions/runs/${candidate.runId}` });
}
