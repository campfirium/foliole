// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SECURITY_COVERAGE, assessObservation, createCoverageReport } from './security-coverage.mjs';
import { npmAuditObservation } from './npm-security-evidence.mjs';
import { workflowReferences } from './security-inputs.mjs';
import { collectSecurityMaintenance } from './security-maintenance.mjs';

const now = Date.parse('2026-11-01T08:00:00Z');
const candidate = { revision: 'a'.repeat(40), inputDigest: 'b'.repeat(64) };
const valid = { candidate, environment: 'host-1', checkedAt: new Date(now).toISOString(), source: 'official', status: 'clean' };
const context = { candidate, environment: 'host-1', now, ttlHours: 26 };
const audit = (findings = false) => JSON.stringify({ auditReportVersion: 2,
  vulnerabilities: findings ? { sample: { name: 'sample', severity: 'high', via: [{ source: 1 }], nodes: ['node_modules/sample'] } } : {},
  metadata: { vulnerabilities: { total: findings ? 1 : 0, high: findings ? 1 : 0, critical: 0, moderate: 0, low: 0, info: 0 } } });
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function repository() {
  const base = path.resolve('.tmp/artifacts/T674/security-report-tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'repo-'));
  roots.push(root);
  mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'npm@11.19.0' }));
  writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  writeFileSync(path.join(root, '.npmrc'), 'save-exact=true\n');
  writeFileSync(path.join(root, '.gitignore'), 'output/\n');
  writeFileSync(path.join(root, '.github/workflows/test.yml'), 'jobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n  other:\n    uses: ./.github/workflows/shared.yml\n');
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
  return root;
}

function fakeNpm(_command, args) {
  if (args[0] === '--version') return { status: 0, stdout: '11.19.0\n' };
  const full = args.includes('--include=dev');
  return { status: full ? 1 : 0, stdout: audit(full) };
}

describe('coverage qualification', () => {
  it('accepts current exact-input environment evidence and preserves each source status', () => {
    for (const status of ['clean', 'findings', 'error', 'unsupported']) {
      expect(assessObservation({ ...valid, status }, context).status).toBe(status);
    }
  });
  it.each([
    [undefined, 'required-observation-missing'],
    [{ ...valid, candidate: { ...candidate, revision: 'other' } }, 'candidate-input-mismatch'],
    [{ ...valid, candidate: { ...candidate, inputDigest: 'changed' } }, 'candidate-input-mismatch'],
    [{ ...valid, environment: 'other-host' }, 'environment-unverified-or-mismatched'],
    [{ ...valid, checkedAt: 'invalid' }, 'observation-expired-or-invalid-time'],
    [{ ...valid, checkedAt: new Date(now - 27 * 3_600_000).toISOString() }, 'observation-expired-or-invalid-time'],
    [{ ...valid, checkedAt: new Date(now + 600_000).toISOString() }, 'observation-expired-or-invalid-time']
  ])('keeps missing, stale and mismatched evidence incomplete', (observation, reason) => {
    expect(assessObservation(observation, context)).toMatchObject({ status: 'error', reason });
  });
  it('requires every declared route and retains known findings when their input is stale', () => {
    const snapshot = { candidate, mode: 'committed', environments: Object.fromEntries(SECURITY_COVERAGE.map(asset => [asset.id, 'host-1'])) };
    const observations = SECURITY_COVERAGE.flatMap(asset => asset.routes.map(route => ({ ...valid, asset: asset.id, route: route.id })));
    expect(createCoverageReport({ snapshot, observations, now }).overallStatus).toBe('clean');
    const finding = { ...observations[0], status: 'findings', candidate: { revision: 'old' }, findings: [{ id: 'known' }] };
    const report = createCoverageReport({ snapshot, observations: [finding, ...observations.slice(1)], now });
    expect(report.overallStatus).toBe('incomplete');
    expect(report.findings[0].id).toBe('npm-runtime');
    const partial = { ...observations[0], status: 'error', findings: [{ id: 'retained-partial-source-finding' }] };
    expect(createCoverageReport({ snapshot, observations: [partial, ...observations.slice(1)], now }).findings[0].id).toBe('npm-runtime');
    expect(createCoverageReport({ snapshot, observations: observations.slice(1), now }).overallStatus).toBe('incomplete');
    expect(createCoverageReport({ snapshot: { ...snapshot, mode: 'working-tree' }, observations, now }).overallStatus).toBe('incomplete');
  });
});

describe('npm source evidence', () => {
  it('separates valid zero matches, findings, malformed responses and process failures', () => {
    const options = { asset: 'npm-build', candidate, environment: 'host-1', checkedAt: valid.checkedAt };
    expect(npmAuditObservation({ status: 0, stdout: audit() }, options).status).toBe('clean');
    expect(npmAuditObservation({ status: 1, stdout: audit(true) }, options).findings[0].name).toBe('sample');
    for (const result of [{ status: 1, stdout: audit() }, { status: 0, stdout: '{}' },
      { status: 0, stdout: '' }, { status: 0, stdout: '{broken' }, { status: 2, stdout: audit() },
      { status: null, signal: 'SIGTERM', stdout: '' }]) {
      expect(npmAuditObservation(result, options).status).toBe('error');
    }
  });
});

it('collects real Git/files, both audit scopes and all parsed action references without hiding native gaps', () => {
  const root = repository();
  const calls = [];
  const report = collectSecurityMaintenance({ root, output: path.join(root, 'output'), now,
    run: (command, args) => { calls.push(args); return fakeNpm(command, args); } });
  expect(report.snapshot.mode).toBe('committed');
  expect(report.snapshot.tools.npm).toBe('11.19.0');
  expect(calls.some(args => args.includes('--omit=dev'))).toBe(true);
  expect(calls.some(args => args.includes('--include=dev'))).toBe(true);
  expect(report.findings.map(row => row.id)).toEqual(['npm-build']);
  expect(report.gaps.map(row => row.id)).toContain('android-maven');
  expect(report.snapshot.actions.references.map(row => row.reference))
    .toEqual(['actions/checkout@v4', './.github/workflows/shared.yml']);
  expect(JSON.parse(readFileSync(path.join(root, 'output/coverage.json'), 'utf8')).overallStatus).toBe('incomplete');
});

it('retains audit findings when a separate source fails or source inputs change mid-collection', () => {
  const root = repository();
  const report = collectSecurityMaintenance({ root, output: path.join(root, 'output'), now,
    nativeReports: { 'android-maven': path.join(root, 'absent.json') },
    run: (command, args) => {
      if (args.includes('--include=dev')) writeFileSync(path.join(root, 'package-lock.json'), '{"changed":true}');
      return fakeNpm(command, args);
    } });
  expect(report.findings.map(row => row.id)).toEqual(['npm-build']);
  expect(report.overallStatus).toBe('incomplete');
  expect(report.limitations).toContain('Inputs or revision changed during collection; rerun this observation.');
});

it('reports malformed workflow YAML as an extraction error instead of omitting it', () => {
  const root = repository();
  writeFileSync(path.join(root, '.github/workflows/broken.yml'), 'jobs: [');
  expect(workflowReferences(root).errors).toHaveLength(1);
});
