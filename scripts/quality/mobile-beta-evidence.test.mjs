// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { createChainVerdict, fullChainStages } from './chain-verdict.mjs';
import { verifyMobileQualitySource, verifyUnchangedMobileProduct } from '../ios/mobile-beta-evidence.mjs';
import { readMobileQualityEvidence, readMobileResumeEvidence } from '../ios/mobile-beta-evidence-read.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function commit(cwd, file, content) {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', file); git(cwd, 'commit', '-m', 'fixture');
  return git(cwd, 'rev-parse', 'HEAD');
}
function fixture() {
  const directory = path.resolve('.tmp/artifacts/T707-3');
  mkdirSync(directory, { recursive: true });
  const cwd = mkdtempSync(path.join(directory, 'evidence-')); roots.push(cwd);
  git(cwd, 'init'); git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'core.fsmonitor', 'false');
  const qualitySourceSha = commit(cwd, 'src/product.ts', 'export const value = 1;');
  const sourceSha = commit(cwd, 'scripts/ios/testflight-archive.mjs', 'automatic archive signing');
  const run = { id: 42, run_attempt: 1, head_sha: qualitySourceSha, head_branch: 'check',
    head_repository: { full_name: 'owner/repo' }, status: 'completed', conclusion: 'failure',
    event: 'workflow_dispatch', path: '.github/workflows/remote-quality.yml',
    display_title: `Dev Quality Check (full) @ ${qualitySourceSha.slice(0, 9)} [mobile:ios]` };
  const artifact = { id: 21, digest: 'sha256:original', expired: false,
    name: 'chain-verdict-42-1', workflow_run: { id: 42 } };
  const needs = Object.fromEntries(fullChainStages('dev-remote').map(stage => [stage,
    { result: 'success', outputs: { accepted_sha: qualitySourceSha } }]));
  const receipt = createChainVerdict({ selection: 'all', targetSha: qualitySourceSha, needs,
    runId: 42, runAttempt: 1, lane: 'dev-remote' });
  const jobs = [{ name: 'full-quality / quality-admission / verdict', conclusion: 'success' },
    { name: 'mobile-ios / Sign and upload iPhone without waiting for Apple processing', conclusion: 'failure',
      steps: [{ name: 'Upload the verified IPA and release the macOS runner', conclusion: 'skipped' }] }];
  return { cwd, qualitySourceSha, sourceSha, run, artifact, receipt, jobs, repository: 'owner/repo' };
}

it('reuses complete original quality after archive failure while preserving both source identities', () => {
  const f = fixture();
  const evidence = readMobileQualityEvidence({ ...f, qualityRunId: '42', distributionRunId: '88',
    readChain: () => f, api: () => JSON.stringify({ total_count: f.jobs.length, jobs: f.jobs }) });
  expect(evidence).toMatchObject({ kind: 'mobile-quality-reuse', qualitySourceSha: f.qualitySourceSha,
    sourceSha: f.sourceSha, qualityRunId: '42', distributionRunId: '88',
    changedPaths: ['scripts/ios/testflight-archive.mjs'] });
  expect(evidence.productDigest).toMatch(/^[a-f0-9]{64}$/u);
  expect(f.receipt.accepted_sha).toBe(f.qualitySourceSha);
});

it.each(['src/product.ts', 'package.json', '.github/workflows/dev-quality-chain.yml', 'scripts/quality/chain-verdict.mjs'])(
  'refuses reuse after product, dependency or original quality criteria change: %s', file => {
    const f = fixture();
    const sourceSha = commit(f.cwd, file, 'changed original input');
    expect(() => verifyUnchangedMobileProduct({ ...f, sourceSha })).toThrow('original quality inputs changed');
  }
);

it.each([
  f => { f.run.conclusion = 'cancelled'; },
  f => { f.run.head_repository.full_name = 'foreign/repo'; },
  f => { f.run.head_branch = 'dev'; },
  f => { f.artifact.expired = true; },
  f => { f.artifact.workflow_run.id = 41; },
  f => { f.receipt.run_attempt = 2; },
  f => { f.receipt.stage_shas['t5-electron'] = 'f'.repeat(40); },
  f => { delete f.receipt.stages['t6-ios-sync-pack']; },
  f => { f.jobs[0].conclusion = 'failure'; },
  f => { f.jobs[1].steps[0].conclusion = 'success'; },
  f => { f.jobs[1].steps[0].conclusion = 'failure'; },
  f => { f.jobs.push({ name: 'full-quality / other quality', conclusion: 'failure' }); }
])('refuses cancelled, incomplete, stale or differently identified quality evidence', mutate => {
  const f = fixture(); mutate(f);
  expect(() => verifyMobileQualitySource(f)).toThrow('Mobile quality reuse refused');
});

it('keeps the original proof usable when only Linux review is rerun in the same distribution run', () => {
  const f = fixture();
  const readChain = () => f;
  const evidence = readMobileQualityEvidence({ ...f, qualityRunId: '42', distributionRunId: '88', readChain,
    api: () => JSON.stringify({ total_count: f.jobs.length, jobs: f.jobs }) });
  const resumed = { ...f.run, id: 88, run_attempt: 2, conclusion: 'success', head_sha: f.sourceSha,
    display_title: `Dev Quality Check (mobile_resume) @ ${f.sourceSha.slice(0, 9)} [mobile:ios] [reuse:42]` };
  const api = endpoint => {
    if (endpoint.endsWith('/runs/88')) return JSON.stringify(resumed);
    if (endpoint.includes('/runs/88/artifacts')) return JSON.stringify({ artifacts: [
      { id: 22, name: 'mobile-quality-reuse-88-1', workflow_run: { id: 88 }, expired: false }
    ] });
    if (endpoint.endsWith('/artifacts/22/zip')) return JSON.stringify(evidence);
    if (endpoint.includes('/runs/42/jobs')) return JSON.stringify({ total_count: f.jobs.length, jobs: f.jobs });
    throw new Error(`Unexpected API ${endpoint}`);
  };
  expect(readMobileResumeEvidence({ repository: f.repository, runId: 88, sourceSha: f.sourceSha,
    cwd: f.cwd, api, decode: JSON.parse, readChain })).toEqual(evidence);
  resumed.head_sha = 'a'.repeat(40);
  expect(() => readMobileResumeEvidence({ repository: f.repository, runId: 88, sourceSha: f.sourceSha,
    cwd: f.cwd, api, decode: JSON.parse, readChain })).toThrow('matching successful run');
});

it('reads the complete current repository inventory without truncating product verification', () => {
  const cwd = process.cwd(); const revision = git(cwd, 'rev-parse', 'HEAD');
  expect(verifyUnchangedMobileProduct({ cwd, qualitySourceSha: revision, sourceSha: revision }))
    .toMatchObject({ productDigest: expect.stringMatching(/^[a-f0-9]{64}$/u), changedPaths: [] });
});
