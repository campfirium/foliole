/* global structuredClone */
import { createCoverageReport, assessObservation, SECURITY_COVERAGE } from '../security/security-coverage.mjs';
import { digest } from '../security/security-inputs.mjs';

// Keep the existing complete report/owner schema; unrelated checks retain their original evidence.
export function mergeIosSecurityCoverage(base, receipt, now = Date.now()) {
  const snapshot = structuredClone(base.snapshot);
  const observations = base.coverage.flatMap(asset => asset.checks
    .filter(check => check.reason !== 'required-observation-missing')
    .map(check => ({ ...check, asset: asset.id })));
  for (const incoming of receipt.checks) {
    const original = observations.find(check => check.asset === incoming.asset && check.route === incoming.route);
    const key = `${incoming.asset}:${incoming.route}`;
    const previousEnvironment = snapshot.environments[key] ?? snapshot.environments[incoming.asset];
    const environment = digest(JSON.stringify({ original: previousEnvironment, ios: incoming.environment }));
    const qualified = original && qualifyOriginal(original, snapshot, previousEnvironment, now);
    const combined = qualified ? combineCheck(qualified, incoming) : { ...incoming };
    combined.environment = environment;
    if (original) observations.splice(observations.indexOf(original), 1, combined);
    else observations.push(combined);
    snapshot.environments[key] = environment;
  }
  const result = createCoverageReport({ snapshot, observations, now });
  result.ios = { checkedAt: receipt.checkedAt, candidate: receipt.candidate,
    sources: receipt.official.sources.map(({ id, url, checkedAt, status, reason, sha256 }) =>
      ({ id, url, checkedAt, status, reason, sha256 })), errors: receipt.errors,
    scope: 'iOS evidence only; unknown applicability remains explicit review findings' };
  if (base.hosted) result.hosted = base.hosted;
  return result;
}

function qualifyOriginal(check, snapshot, environment, now) {
  const route = SECURITY_COVERAGE.find(asset => asset.id === check.asset).routes.find(row => row.id === check.route);
  const qualified = assessObservation(check, { candidate: snapshot.candidate, environment, now, ttlHours: route.ttlHours });
  return qualified === check ? check : { ...check, status: qualified.status, reason: qualified.reason,
    findings: [], evidence: { originalUnqualified: check } };
}

function combineCheck(original, incoming) {
  const incomplete = [original, incoming].find(check => ['error', 'unsupported'].includes(check.status));
  const findings = [...original.findings ?? [], ...incoming.findings ?? []];
  return { ...incoming, status: incomplete?.status ?? (findings.length ? 'findings' : 'clean'),
    checkedAt: Date.parse(original.checkedAt) < Date.parse(incoming.checkedAt) ? original.checkedAt : incoming.checkedAt,
    reason: incomplete?.reason ?? incoming.reason, source: `${original.source}; ${incoming.source}`,
    findings, evidence: { original: { ...original }, ios: incoming.evidence } };
}
