import { verifyTestflightReceipt } from '../ios/testflight-candidate.mjs';

const task = 'foliole-testflight-review';
const environment = 'foliole-testflight-beta';
const query = `task=${task}&environment=${environment}&per_page=100`;

function registeredReceipt(row) {
  if (row.task !== task || row.environment !== environment || row.creator?.login !== 'github-actions[bot]' ||
      row.sha !== row.payload?.sourceSha) {
    throw new Error('Untrusted TestFlight review registration');
  }
  return verifyTestflightReceipt(row.payload, { sha: row.sha });
}

async function listRegistrations(api, filter = '') {
  const registrations = [];
  for (let page = 1; ; page += 1) {
    const rows = await api('GET', `deployments?${query}&page=${page}${filter}`);
    if (!Array.isArray(rows)) throw new Error('TestFlight review registrations are unavailable');
    registrations.push(...rows.map(registeredReceipt));
    if (rows.length < 100) return registrations;
  }
}

export async function registerTestflightReview(api, receipt) {
  const { sourceSha, buildId } = verifyTestflightReceipt(receipt);
  const registrations = await listRegistrations(api, `&sha=${sourceSha}`);
  const existing = registrations.find(candidate => candidate.buildId === buildId);
  const registered = existing ?? registeredReceipt(await api('POST', 'deployments', {
    ref: sourceSha, task, environment, auto_merge: false, required_contexts: [],
    production_environment: false, transient_environment: false, payload: receipt
  }));
  if (['sourceSha', 'version', 'buildId', 'buildNumber', 'ipaSha256']
    .some(key => registered[key] !== receipt[key])) throw new Error('Registered TestFlight build differs');
  return registered;
}

function compareNumericVersions(left, right) {
  const parts = left.split('.');
  const other = right.split('.');
  return parts.reduce((order, part, index) => order || Number(part) - Number(other[index]), 0);
}

export async function listTestflightReviews(api, historicalCandidate) {
  // Carry the pre-registry submission through the rollout without requiring another upload.
  const candidates = new Map([[historicalCandidate.buildId, historicalCandidate]]);
  for (const receipt of await listRegistrations(api)) candidates.set(receipt.buildId, receipt);
  return [...candidates.values()].sort((left, right) =>
    compareNumericVersions(right.version, left.version) || compareNumericVersions(right.buildNumber, left.buildNumber));
}
