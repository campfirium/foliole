import { SECURITY_COVERAGE } from './security-coverage.mjs';
import { digest } from './security-inputs.mjs';

const token = (value, label) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9@/:._+~-]{1,240}$/u.test(value)) {
    throw new Error(`Unsupported ${label} identity`);
  }
  return value;
};

function npmFindings(rows, lock) {
  const findings = [];
  for (const row of rows) {
    for (const advisory of (row.via ?? []).filter(value => typeof value === 'object')) {
      const id = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/u.exec(advisory.url ?? '')?.[1];
      if (!id) throw new Error('Unsupported npm advisory identity');
      const versions = [...new Set((row.nodes ?? []).map(node => lock.packages?.[node]?.version))].sort();
      if (!versions.length || versions.some(version => !version)) throw new Error('Audit nodes missing from verified lock');
      findings.push({ provider: 'npm', platform: 'npm-lock', advisory: id, package: token(advisory.name ?? row.name, 'package'),
        versions: versions.map(version => token(version, 'version')), severity: ['info', 'low', 'moderate', 'high', 'critical'].includes(advisory.severity) ? advisory.severity : 'unclassified',
        affectedRange: advisory.range, source: advisory.url });
    }
  }
  return findings;
}

function mavenFindings(rows) {
  return rows.flatMap(row => (row.advisories ?? []).map(advisory => ({ provider: 'osv-maven', platform: 'android',
    advisory: token(advisory.id, 'advisory'), package: `${token(row.module?.group, 'Maven group')}:${token(row.module?.name, 'Maven package')}`,
    versions: [token(row.module?.version, 'version')], source: 'https://osv.dev/', severity: 'unclassified' })));
}

function officialFindings(rows) {
  return rows.map(row => {
    if (!Array.isArray(row.versions) || !row.versions.length || !/^https:\/\//u.test(row.source ?? '')
      || !['info', 'low', 'moderate', 'high', 'critical', 'unclassified'].includes(row.severity)) {
      throw new Error('Official finding requires affected versions, severity and a primary source');
    }
    return { provider: 'official-review', platform: token(row.platform, 'platform'),
      advisory: token(row.advisory, 'advisory'), package: token(row.package, 'package'),
      versions: row.versions.map(version => token(version, 'version')).sort(),
      severity: row.severity, affectedRange: row.affectedRange, source: row.source, assessment: row.assessment };
  });
}

function normaliseCheck(asset, check, report, lock) {
  if (!asset.routes.some(route => route.id === check.route)
    || !['clean', 'findings', 'error', 'unsupported'].includes(check.status)) {
    throw new Error('Malformed coverage route/status');
  }
  const key = `${asset.id}:${check.route}`;
  const result = { key, asset: asset.id, route: check.route, status: check.status,
    ttlHours: asset.routes.find(route => route.id === check.route).ttlHours,
    reason: check.reason, evidence: check.evidence,
    attempted: check.reason !== 'required-observation-missing', findings: [], unqualifiedFindings: 0 };
  const original = check.observed ?? check;
  const rows = original.findings ?? [];
  if (!rows.length) return result;
  if (original.candidate?.revision !== report.snapshot.candidate.revision
    || original.candidate?.inputDigest !== report.snapshot.candidate.inputDigest) {
    result.unqualifiedFindings = rows.length;
    return result;
  }
  try {
    result.findings = asset.id.startsWith('npm-') ? npmFindings(rows, lock)
      : asset.id === 'android-maven' ? mavenFindings(rows)
        : ['official-review', 'vendor-notices', 'component-notices'].includes(check.route) ? officialFindings(rows) : [];
    if (!result.findings.length) throw new Error('Finding source has no supported advisory details');
  } catch (error) { result.status = 'error'; result.reason = error.message; result.unqualifiedFindings = rows.length; }
  result.findings = result.findings.map(finding => ({ ...finding,
    key: digest(`${finding.provider}|${finding.platform}|${finding.package}|${finding.advisory}`),
    versionDigest: digest(JSON.stringify(finding.versions)), scope: key }));
  return result;
}

export function normaliseSecurityObservation(rawReport, envelope, rawLock, now = Date.now()) {
  const report = JSON.parse(rawReport);
  const lock = JSON.parse(rawLock);
  const candidate = report.snapshot?.candidate;
  if (report.schemaVersion !== 1 || !/^[a-f0-9]{40}$/u.test(candidate?.revision ?? '')
    || !/^[a-f0-9]{64}$/u.test(candidate?.inputDigest ?? '') || !Array.isArray(report.coverage)) {
    throw new Error('Malformed security report identity');
  }
  if (envelope.repository !== 'campfirium/foliole' || envelope.headSha !== candidate.revision
    || !['ci', 'local'].includes(envelope.kind)) throw new Error('Source repository/candidate/kind mismatch');
  if (envelope.kind === 'ci' && (!/^\d+$/u.test(String(envelope.runId))
    || !Number.isInteger(envelope.attempt) || envelope.attempt < 1
    || !/^\d+$/u.test(String(envelope.artifactId)) || !/^sha256:[a-f0-9]{64}$/u.test(envelope.artifactDigest ?? '')
    || envelope.workflow !== 't7-hosted-quality.yml'
    || envelope.branch !== 'dev' || String(report.hosted?.runId) !== String(envelope.runId)
    || String(report.hosted?.runAttempt) !== String(envelope.attempt)
    || report.hosted?.target !== candidate.revision || report.snapshot.mode !== 'committed')) {
    throw new Error('Artifact does not match verified scheduled workflow identity');
  }
  if (digest(rawLock) !== report.snapshot.inputs?.['package-lock.json'] || ![2, 3].includes(lock.lockfileVersion)) {
    throw new Error('Npm lock does not match observed candidate inputs');
  }
  const age = now - Date.parse(report.generatedAt);
  if (!Number.isFinite(age) || age < -300_000 || age > 26 * 3_600_000) throw new Error('Expired or invalid report time');
  const seen = new Set();
  const checks = report.coverage.flatMap(row => {
    const asset = SECURITY_COVERAGE.find(value => value.id === row.id);
    if (!asset || seen.has(row.id) || !Array.isArray(row.checks)) throw new Error('Unknown or duplicate coverage asset');
    seen.add(row.id);
    if (row.checks.length !== asset.routes.length || new Set(row.checks.map(check => check.route)).size !== asset.routes.length) {
      throw new Error('Missing or duplicate coverage routes');
    }
    return row.checks.map(check => normaliseCheck(asset, check, report, lock));
  });
  if (seen.size !== SECURITY_COVERAGE.length) throw new Error('Required coverage assets missing');
  const source = { kind: envelope.kind, repository: envelope.repository, workflow: envelope.workflow,
    branch: envelope.branch, runId: envelope.runId, attempt: envelope.attempt, headSha: envelope.headSha,
    artifactId: envelope.artifactId, artifactDigest: envelope.artifactDigest,
    reportSha256: digest(rawReport), lockSha256: digest(rawLock) };
  return { schemaVersion: 1, id: digest(JSON.stringify(source)), source,
    role: envelope.kind === 'ci' ? 'github:scheduled-security'
      : `local:${token(report.snapshot.tools?.platform, 'platform')}:${token(report.snapshot.tools?.arch, 'architecture')}`, checkedAt: report.generatedAt, candidate, checks,
    overallStatus: report.overallStatus, evidenceMode: report.snapshot.mode };
}
