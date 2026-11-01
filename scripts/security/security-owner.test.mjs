// @vitest-environment node
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SECURITY_COVERAGE } from './security-coverage.mjs';
import { digest } from './security-inputs.mjs';
import { importSecurityObservation, projectSecurityOwner, setSecurityDisposition } from './security-owner.mjs';

const start = Date.parse('2026-11-01T08:00:00Z');
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function owner() {
  const base = path.resolve('.tmp/artifacts/T674/security-owner-tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'owner-'));
  roots.push(root);
  return root;
}
function observation({ time = start, status = 'findings', version = '1.0.0', severity = 'moderate', id = 1 } = {}) {
  const rawLock = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/example': { version } } });
  const candidate = { revision: 'a'.repeat(40), inputDigest: 'b'.repeat(64) };
  const environment = 'ci-linux';
  const detail = { name: 'example', nodes: ['node_modules/example'], via: [{ name: 'example',
    url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', range: '<2.0.0', severity }] };
  const coverage = SECURITY_COVERAGE.map(asset => ({ id: asset.id,
    checks: asset.routes.map(route => asset.id === 'npm-build' ? { route: route.id, candidate, environment,
      source: 'npm audit', checkedAt: new Date(time).toISOString(), status, findings: status === 'findings' ? [detail] : [] }
      : { route: route.id, status: 'error', reason: 'required-observation-missing' }) }));
  const report = { schemaVersion: 1, generatedAt: new Date(time).toISOString(), coverage,
    overallStatus: 'incomplete', hosted: { target: candidate.revision, runId: String(id), runAttempt: '1' },
    snapshot: { candidate, mode: 'committed', inputs: { 'package-lock.json': digest(rawLock) }, tools: { platform: 'linux', arch: 'x64' } } };
  const envelope = { kind: 'ci', repository: 'campfirium/foliole', workflow: 't7-hosted-quality.yml', branch: 'dev',
    headSha: candidate.revision, runId: String(id), attempt: 1, createdAt: new Date(time).toISOString(), artifactId: id, artifactDigest: `sha256:${'c'.repeat(64)}` };
  return { rawReport: JSON.stringify(report), rawLock, envelope, now: time };
}
const active = state => state.findings.filter(finding => finding.active);

it('persists verified version-aware facts across restart and deduplicates the same artifact', () => {
  const root = owner();
  const input = observation();
  const receipt = importSecurityObservation(root, input);
  expect(receipt.duplicate).toBe(false);
  expect(importSecurityObservation(root, input).duplicate).toBe(true);
  expect(active(projectSecurityOwner(root, start))[0]).toMatchObject({ versions: ['1.0.0'], severity: 'moderate' });
  const restarted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    "import { projectSecurityOwner } from './scripts/security/security-owner.mjs'; console.log(JSON.stringify(projectSecurityOwner(process.argv[1], Number(process.argv[2]))));", root, String(start)],
  { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }));
  expect(active(restarted)[0].versions).toEqual(['1.0.0']);
  expect(projectSecurityOwner(root, start).gaps.length).toBeGreaterThan(0);
  expect(JSON.parse(readFileSync(receipt.file, 'utf8')).source.reportSha256).toBe(digest(input.rawReport));
});

it('retains local working-tree provenance without attesting a frozen CI candidate', () => {
  const root = owner();
  const input = observation();
  const report = JSON.parse(input.rawReport);
  report.snapshot.mode = 'working-tree'; delete report.hosted;
  input.rawReport = JSON.stringify(report); input.envelope.kind = 'local';
  const receipt = importSecurityObservation(root, input);
  expect(receipt.observation.evidenceMode).toBe('working-tree');
  expect(receipt.observation.role).toBe('local:linux:x64');
  expect(projectSecurityOwner(root, start).overallStatus).toBe('incomplete');
});

it('retains known findings through a source failure, then clears only on a later complete observation', () => {
  const root = owner();
  importSecurityObservation(root, observation());
  importSecurityObservation(root, observation({ id: 2, time: start + 1000, status: 'error' }));
  expect(active(projectSecurityOwner(root, start + 1000))).toHaveLength(1);
  importSecurityObservation(root, observation({ id: 3, time: start + 2000, status: 'clean' }));
  expect(active(projectSecurityOwner(root, start + 2000))).toHaveLength(0);
  importSecurityObservation(root, observation({ id: 4, time: start + 3000 }));
  expect(active(projectSecurityOwner(root, start + 3000))).toHaveLength(1);
});

it('does not rewind current results when an older artifact arrives late', () => {
  const root = owner();
  importSecurityObservation(root, observation({ id: 2, time: start + 1000, status: 'clean' }));
  importSecurityObservation(root, { ...observation(), now: start + 2000 });
  expect(active(projectSecurityOwner(root, start + 2000))).toHaveLength(0);
});

it.each(['head', 'lock', 'expired', 'missing-asset'])('rejects %s evidence without erasing a successful observation', kind => {
  const root = owner();
  importSecurityObservation(root, observation());
  const input = observation({ id: 2, time: start + 1000 });
  if (kind === 'head') input.envelope.headSha = 'c'.repeat(40);
  if (kind === 'lock') input.rawLock = '{}';
  if (kind === 'expired') input.now = start + 27 * 3_600_000;
  if (kind === 'missing-asset') {
    const report = JSON.parse(input.rawReport); report.coverage.pop(); input.rawReport = JSON.stringify(report);
  }
  expect(() => importSecurityObservation(root, input)).toThrow();
  expect(active(projectSecurityOwner(root, input.now))).toHaveLength(1);
  expect(projectSecurityOwner(root, input.now).health.some(value => value.status === 'error')).toBe(true);
});

it('atomically publishes observations and recovers after interruption before rename', () => {
  const root = owner();
  importSecurityObservation(root, observation());
  const input = observation({ id: 2, time: start + 1000, status: 'clean' });
  expect(() => importSecurityObservation(root, { ...input, beforeRename: () => { throw new Error('interrupted'); } })).toThrow('interrupted');
  expect(active(projectSecurityOwner(root, start + 1000))).toHaveLength(1);
  writeFileSync(path.join(root, 'observations/.abandoned.tmp'), '{partial');
  importSecurityObservation(root, input);
  expect(active(projectSecurityOwner(root, start + 1000))).toHaveLength(0);
  expect(projectSecurityOwner(root, start + 1000).health.every(value => value.status === 'clean')).toBe(true);
});

describe('scoped disposition', () => {
  it('expires deferrals and invalidates them when selected versions or advisory severity change', () => {
    const root = owner();
    importSecurityObservation(root, observation());
    const finding = active(projectSecurityOwner(root, start))[0];
    setSecurityDisposition(root, { finding: finding.key, versionDigest: finding.versionDigest, riskDigest: finding.riskDigest,
      status: 'deferred', reason: 'Await compatible upstream fix; no unsupported override.', expiresAt: new Date(start + 3_600_000).toISOString() }, start);
    expect(active(projectSecurityOwner(root, start))[0].disposition.status).toBe('deferred');
    expect(projectSecurityOwner(root, start).overallStatus).toBe('incomplete');
    expect(active(projectSecurityOwner(root, start + 3_600_001))[0].disposition.status).toBe('expired-or-evidence-changed');
    importSecurityObservation(root, observation({ id: 2, time: start + 1000, severity: 'high' }));
    expect(active(projectSecurityOwner(root, start + 1000))[0].disposition.status).toBe('expired-or-evidence-changed');
    importSecurityObservation(root, observation({ id: 3, time: start + 2000, version: '1.1.0' }));
    expect(active(projectSecurityOwner(root, start + 2000))[0].versions).toEqual(['1.1.0']);
  });
  it('rejects a premature fixed claim or a disposition for another version', () => {
    const root = owner();
    importSecurityObservation(root, observation());
    const finding = active(projectSecurityOwner(root, start))[0];
    const options = { finding: finding.key, versionDigest: finding.versionDigest, riskDigest: finding.riskDigest,
      status: 'fixed', reason: 'Not yet verified', expiresAt: new Date(start + 3_600_000).toISOString() };
    expect(() => setSecurityDisposition(root, options, start)).toThrow('current finding');
    expect(() => setSecurityDisposition(root, { ...options, status: 'deferred', versionDigest: 'c'.repeat(64) }, start)).toThrow('current finding');
  });
});
