import { readFileSync } from 'node:fs';
import { SECURITY_COVERAGE } from './security-coverage.mjs';
import { digest } from './security-inputs.mjs';

export const officialSecurityAssets = SECURITY_COVERAGE.filter(asset =>
  asset.routes.some(route => route.id === 'official-review')).map(asset => asset.id);

// This imports a human/agent review of primary sources; it performs no advisory inference.
export function officialSecurityObservations(file, snapshot) {
  if (!file) return [];
  let review;
  try {
    review = JSON.parse(readFileSync(file, 'utf8'));
    if (review.schemaVersion !== 1 || !Array.isArray(review.assets)
      || !review.environment || !Number.isFinite(Date.parse(review.checkedAt))
      || review.assets.length !== officialSecurityAssets.length
      || new Set(review.assets.map(row => row.asset)).size !== officialSecurityAssets.length
      || review.assets.some(row => !officialSecurityAssets.includes(row.asset))) {
      throw new Error('Official review requires all declared asset families and a dated environment');
    }
    return review.assets.map(row => officialObservation(row, review, snapshot));
  } catch (error) {
    return officialSecurityAssets.map(asset => ({ asset, route: 'official-review',
      candidate: snapshot.candidate, environment: snapshot.environments[asset] = 'unverified-review',
      checkedAt: new Date().toISOString(), source: 'official-review-import', status: 'error', reason: error.message }));
  }
}

function officialObservation(row, review, snapshot) {
  if (!['clean', 'findings', 'unsupported', 'error'].includes(row.status)
    || !row.reason?.trim() || !row.versions || !Object.keys(row.versions).length
    || row.status === 'clean' && Object.values(row.versions).some(value => /unknown|unverified/iu.test(String(value)))
    || !Array.isArray(row.sources) || !row.sources.length
    || row.sources.some(source => !/^https:\/\//u.test(source))
    || !Array.isArray(row.findings) || row.status === 'clean' && row.findings.length) {
    throw new Error('Official review requires explicit status, versions, source URLs and assessment');
  }
  const environment = digest(JSON.stringify({ tools: snapshot.tools, review: review.environment, versions: row.versions }));
  snapshot.environments[row.asset] = environment;
  snapshot.environments[`${row.asset}:official-review`] = environment;
  return { asset: row.asset, route: 'official-review', candidate: review.candidate,
    environment, checkedAt: review.checkedAt, source: row.sources.join(' '), status: row.status,
    reason: row.reason, findings: row.findings,
    evidence: { environment: review.environment, versions: row.versions, sources: row.sources,
      packages: row.packages ?? [], checkedAt: review.checkedAt } };
}
