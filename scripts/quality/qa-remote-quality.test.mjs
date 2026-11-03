// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { qaPreflightBase, runQaRemoteQuality } from './qa-remote-quality.mjs';
import { runRemoteQuality } from './remote-quality.mjs';
import { qaGit, readQaWorkspace } from './qa-workspace-state.mjs';
import { fixture, roots } from './qa-remote-test-support.mjs';
import { withResourceGate } from '../lib/resource-gate.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('pushes and checks the registered QA snapshot while dev continues independently', async () => {
  const f = fixture();
  writeFileSync(path.join(f.dev, 'new-feature'), 'development');
  qaGit(f.dev, 'add', 'new-feature');
  qaGit(f.dev, 'commit', '-m', 'feature');
  const result = await runRemoteQuality({ args: ['--scope', 'full'], cwd: f.cwd,
    runner: f.options.runner, qaPreflight: f.preflight, qaMonitor: f.monitor, readChainVerdict: f.readVerdict });
  const dispatch = f.calls.find(call => call.args.includes('--method'));
  expect(JSON.parse(dispatch.options.input)).toEqual({ ref: 'check', inputs: {
    scope: 'full', target_sha: f.identity.head_sha, trigger_short: f.identity.head_sha.slice(0, 9)
  } });
  expect(qaGit(f.cwd, 'ls-remote', 'origin', 'refs/heads/check')).toContain(f.identity.head_sha);
  expect(f.preflight).toHaveBeenCalledWith(expect.objectContaining({ targetSha: f.identity.head_sha, base: f.identity.head_sha }));
  expect(result.sourceRef).toBe('refs/heads/check');
  expect(readQaWorkspace(f.cwd).run).toMatchObject({ runId: 42, passed: true });
  expect(qaGit(f.dev, 'rev-parse', 'HEAD')).not.toBe(result.targetSha);
});

it('resumes the saved run without dispatching another or occupying Windows', async () => {
  const f = fixture();
  await runQaRemoteQuality(f.options);
  await runQaRemoteQuality(f.options);
  expect(f.calls.filter(call => call.args.includes('--method'))).toHaveLength(1);
  expect(f.preflight).toHaveBeenCalledTimes(1);
  expect(f.monitor).toHaveBeenCalledTimes(2);
  expect(f.calls.some(call => call.args.some(arg => arg.includes('windows')))).toBe(false);
});

it('does not queue metadata-only preflight behind an open development preview', async () => {
  const f = fixture();
  for (const directory of ['scripts', 'src', 'lib']) {
    symlinkSync(path.resolve(directory), path.join(f.cwd, directory), 'dir');
  }
  vi.stubEnv('FOLIOLE_RESOURCE_GATE_HELD', '');
  vi.stubEnv('FOLIOLE_RESOURCE_GATE_RUNTIME_DIR', path.join(f.dev, '.lab/internal/runtime'));
  let pending;
  try {
    await withResourceGate({ className: 'preview', repoRoot: f.dev, fn: async () => {
      pending = runRemoteQuality({ args: ['--scope', 'full'], cwd: f.cwd,
        runner: f.options.runner, qaMonitor: f.monitor, readChainVerdict: f.readVerdict });
      const outcome = await Promise.race([pending.then(() => 'dispatched'), delay(3000).then(() => 'blocked')]);
      expect(outcome).toBe('dispatched');
    } });
  } finally {
    await pending;
  }
});

it('keeps the failed run for recovery and never marks its candidate passed', async () => {
  const f = fixture();
  f.monitor.mockResolvedValue({ failed: true, jobs: [] });
  await expect(runQaRemoteQuality(f.options)).rejects.toThrow(/failed/u);
  expect(readQaWorkspace(f.cwd).run).toMatchObject({ runId: 42 });
  expect(readQaWorkspace(f.cwd).run.passed).toBeUndefined();
});

it('requires a full receipt for this precise commit, not partial or other-commit green', async () => {
  const f = fixture();
  f.readVerdict.mockResolvedValue({ kind: 'replay', verdict: 'passed', accepted_sha: 'a'.repeat(40) });
  await expect(runQaRemoteQuality(f.options)).rejects.toThrow(/matching complete/u);
  expect(readQaWorkspace(f.cwd).run.passed).toBeUndefined();
});

it('rejects dirty repairs, Windows preflight, and a mismatched remote source identity', async () => {
  const f = fixture();
  writeFileSync(path.join(f.cwd, 'uncommitted'), 'repair');
  await expect(runQaRemoteQuality(f.options)).rejects.toThrow(/Commit QA repairs/u);
  rmSync(path.join(f.cwd, 'uncommitted'));
  await expect(runQaRemoteQuality({ ...f.options, args: { scope: 'full', preflightHost: 'windows' } }))
    .rejects.toThrow(/Mac preflight/u);
  f.identity.head_sha = 'b'.repeat(40);
  await expect(runQaRemoteQuality(f.options)).rejects.toThrow(/identity differs/u);
});

it('refuses to replace an active QA run of another snapshot', async () => {
  const f = fixture();
  f.active.push({ id: 33, head_branch: 'check', head_sha: 'b'.repeat(40),
    status: 'in_progress', html_url: 'https://github.test/runs/33' });
  await expect(runQaRemoteQuality(f.options)).rejects.toThrow(/already has an active/u);
  expect(f.calls.some(call => call.args.includes('--method'))).toBe(false);
});

it('uses a verified ancestor rather than a newer green dev snapshot outside QA', async () => {
  const f = fixture();
  writeFileSync(path.join(f.dev, 'new-feature'), 'new');
  qaGit(f.dev, 'add', 'new-feature');
  qaGit(f.dev, 'commit', '-m', 'new feature');
  for (const sha of [qaGit(f.dev, 'rev-parse', 'HEAD'), f.identity.head_sha]) {
    f.green.push({ head_sha: sha, display_title: `Dev Quality Check (full) @ ${sha.slice(0, 9)}` });
  }
  expect(await qaPreflightBase({ ...f.options, targetSha: f.identity.head_sha, scope: 'full' })).toBe(f.identity.head_sha);
});

it('preserves an ambiguous dispatch and refuses to send another blindly', async () => {
  const f = fixture();
  const runner = async (command, args, options) => {
    if (args.includes('--method')) return { code: 1, stderr: 'EOF', stdout: '' };
    return f.options.runner(command, args, options);
  };
  await expect(runQaRemoteQuality({ ...f.options, runner })).rejects.toThrow(/EOF/u);
  expect(readQaWorkspace(f.cwd).dispatchPending).toMatchObject({ targetSha: f.identity.head_sha });
  await expect(runQaRemoteQuality({ ...f.options, runner })).rejects.toThrow(/verify delivery/u);
  expect(readQaWorkspace(f.cwd).run).toBeUndefined();
});

it('requires the workflow guard to bind QA source and topology to the event snapshot', () => {
  const workflow = parse(readFileSync('.github/workflows/remote-quality.yml', 'utf8'));
  const guard = workflow.jobs['dev-ref'].steps.find(step => step.env?.WORKFLOW_SHA);
  const matching = { TARGET_SHA: 'a'.repeat(40), EVENT_SHA: 'a'.repeat(40), WORKFLOW_SHA: 'a'.repeat(40) };
  expect(spawnSync('bash', ['-c', guard.run], { env: { ...process.env, ...matching } }).status).toBe(0);
  for (const key of ['EVENT_SHA', 'WORKFLOW_SHA']) {
    expect(spawnSync('bash', ['-c', guard.run], { env: { ...process.env, ...matching, [key]: 'b'.repeat(40) } }).status).not.toBe(0);
  }
});
