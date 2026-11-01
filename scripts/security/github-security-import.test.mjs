// @vitest-environment node
import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { digest } from './security-inputs.mjs';
import { refreshGithubSecurityOwner } from './github-security-import.mjs';
import { projectSecurityOwner } from './security-owner.mjs';
import { notifySecurityOwner } from './security-notifications.mjs';
import { notificationObservation } from './security-notification-fixture.mjs';
import { securityArtifactFixture } from './security-artifact-fixture.mjs';
import { readSecurityArchive } from './github-security-artifact.mjs';

const roots = [];
const now = Date.now();
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const base = path.resolve('.tmp/artifacts/T674/security-import-tests');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'run-'));
  roots.push(root);
  const input = notificationObservation(now);
  const report = JSON.parse(input.rawReport);
  report.snapshot.mode = 'committed'; report.hosted = { target: report.snapshot.candidate.revision, runId: '42', runAttempt: '1' };
  const candidate = { databaseId: 42, headSha: report.snapshot.candidate.revision };
  const run = { id: 42, path: '.github/workflows/t7-hosted-quality.yml', head_branch: 'dev', head_sha: candidate.headSha,
    status: 'completed', conclusion: 'success', event: 'schedule', run_attempt: 1,
    repository: { id: 123, full_name: 'campfirium/foliole' }, head_repository: { id: 123, full_name: 'campfirium/foliole' } };
  let rawReport = JSON.stringify(report);
  let bytes = securityArtifactFixture({ 'coverage.json': rawReport });
  const artifact = { id: 77, name: `security-maintenance-${run.head_sha}-1`, digest: `sha256:${digest(bytes)}`, expired: false,
    workflow_run: { id: 42, head_sha: run.head_sha, head_branch: 'dev', repository_id: 123, head_repository_id: 123 } };
  const calls = [];
  const api = (endpoint, binary) => {
    calls.push(endpoint);
    if (endpoint.endsWith(`/runs/${run.id}`)) return run;
    if (endpoint.includes('/artifacts?')) return { artifacts: [artifact] };
    if (binary) return bytes;
    if (endpoint.includes('/contents/')) return { encoding: 'base64', content: Buffer.from(input.rawLock).toString('base64') };
    throw new Error('Unexpected request');
  };
  // The external extraction command is replaced on Windows, where this Mac producer is unsupported.
  const extract = process.platform === 'win32' ? () => rawReport : undefined;
  const rebuild = () => {
    rawReport = JSON.stringify(report);
    bytes = securityArtifactFixture({ 'coverage.json': rawReport });
    artifact.digest = `sha256:${digest(bytes)}`;
  };
  return { root, input, report, candidate, run, artifact, api, calls, extract, rebuild };
}
const refresh = f => refreshGithubSecurityOwner(f.root, f.candidate, { api: f.api, extract: f.extract, now });
const owner = f => path.join(f.root, '.lab/internal/security-maintenance');

it('imports a real ZIP despite a successful outer workflow and persists dedupe across independent calls', () => {
  const f = fixture();
  expect(refresh(f)).toMatchObject({ duplicate: false, runId: 42, artifactId: 77 });
  expect(projectSecurityOwner(owner(f), now).findings[0]).toMatchObject({ active: true, versions: ['1.0.0'] });
  f.calls.length = 0;
  expect(refresh(f).duplicate).toBe(true);
  expect(f.calls).toHaveLength(1);
  const codexHome = path.join(f.root, 'codex');
  mkdirSync(path.join(codexHome, 'local-tools/desktop-handoff'), { recursive: true });
  writeFileSync(path.join(codexHome, 'local-tools/desktop-handoff/config.json'), '{}');
  expect(notifySecurityOwner(owner(f), f.root, { codexHome, now })).toHaveLength(0);
  expect(notifySecurityOwner(owner(f), f.root, { codexHome, now: now + 300_000 })[0].delivery.status).toBe('queued');
});

it.each(['workflow', 'branch', 'fork', 'head', 'attempt', 'artifact-run', 'artifact-head', 'digest', 'expired', 'lock'])(
  'rejects %s mismatch without clearing previous findings', kind => {
    const f = fixture();
    expect(refresh(f).status).not.toBe('error');
    // A newer run continuously follows the original observation in the same owner.
    f.run.id = 43; f.candidate.databaseId = 43; f.artifact.workflow_run.id = 43;
    f.artifact.id = 78; f.report.hosted.runId = '43'; f.rebuild();
    if (kind === 'workflow') f.run.path = '.github/workflows/t7-release.yml';
    if (kind === 'branch') f.run.head_branch = 'release';
    if (kind === 'fork') f.run.head_repository.full_name = 'attacker/foliole';
    if (kind === 'head') f.candidate.headSha = 'f'.repeat(40);
    if (kind === 'attempt') f.run.run_attempt = 0;
    if (kind === 'artifact-run') f.artifact.workflow_run.id = 999;
    if (kind === 'artifact-head') f.artifact.workflow_run.head_sha = 'f'.repeat(40);
    if (kind === 'digest') f.artifact.digest = `sha256:${'0'.repeat(64)}`;
    if (kind === 'expired') f.artifact.expired = true;
    if (kind === 'lock') f.input.rawLock = '{}';
    const result = refresh(f);
    expect(result.status).toBe('error');
    expect(result.reason).toMatch(kind === 'lock' ? /lock does not match/u
      : kind === 'digest' ? /ZIP digest/u
        : ['expired', 'artifact-run', 'artifact-head'].includes(kind) ? /provenance/u : /verified completed dev/u);
    const state = projectSecurityOwner(owner(f), now);
    expect(state.findings.some(finding => finding.active)).toBe(true);
    expect(state.health.some(health => health.role === 'github-security-artifact' && health.status === 'error')).toBe(true);
  });

it('reports missing artifacts, failed listing and freshness breaches without a successful-import checkpoint', () => {
  const f = fixture();
  const brokenApi = endpoint => {
    if (endpoint.endsWith('/runs/42')) return f.run;
    throw new Error('permission unavailable');
  };
  expect(refreshGithubSecurityOwner(f.root, f.candidate, { api: brokenApi, now }).status).toBe('error');
  expect(refresh(f).duplicate).toBe(false);
  expect(refreshGithubSecurityOwner(f.root, f.candidate, { api: f.api, now: now + 27 * 3_600_000 }).status).toBe('error');
  expect(projectSecurityOwner(owner(f), now).findings[0].active).toBe(true);
});

it('paginates artifact metadata and reports a missing current-attempt artifact as a source failure', () => {
  const f = fixture();
  const api = (endpoint, binary) => endpoint.includes('/artifacts?')
    ? { artifacts: endpoint.endsWith('page=1')
      ? Array.from({ length: 100 }, (_, id) => ({ id, name: `unrelated-${id}` })) : [f.artifact] }
    : f.api(endpoint, binary);
  expect(refreshGithubSecurityOwner(f.root, f.candidate, { api, extract: f.extract, now }).duplicate).toBe(false);
  f.run.run_attempt = 2;
  expect(refreshGithubSecurityOwner(f.root, f.candidate, { api, extract: f.extract, now }).reason).toMatch(/Missing or duplicate/u);
});

it.runIf(process.platform !== 'win32')('reads an actual setup-failure ZIP as an error instead of an empty report', () => {
  const f = fixture();
  const bytes = securityArtifactFixture({ 'failure.json': JSON.stringify({ reason: 'native resolution unavailable' }) });
  expect(() => readSecurityArchive(bytes, { id: 88, digest: `sha256:${digest(bytes)}` }, f.root))
    .toThrow('Security collection failed: native resolution unavailable');
});
