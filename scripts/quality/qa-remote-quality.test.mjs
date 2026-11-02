// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { qaPreflightBase, runQaRemoteQuality } from './qa-remote-quality.mjs';
import { runRemoteQuality } from './remote-quality.mjs';
import { qaGit, readQaWorkspace } from './qa-workspace-state.mjs';
import { startQaWorkspace } from './qa-workspace.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const artifacts = path.resolve('.tmp/artifacts/T682/remote-fixtures');
  mkdirSync(artifacts, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(artifacts, 'qa-')));
  roots.push(root);
  const dev = path.join(root, 'dev');
  execFileSync('git', ['init', '-b', 'dev', dev], { stdio: 'pipe' });
  qaGit(dev, 'config', 'user.name', 'Test');
  qaGit(dev, 'config', 'user.email', 'test@example.com');
  qaGit(dev, 'config', 'core.fsmonitor', 'false');
  writeFileSync(path.join(dev, '.gitignore'), '.tmp/\n.cache/\n.lab/\nAGENTS.local.md\n');
  qaGit(dev, 'add', '.gitignore');
  qaGit(dev, 'commit', '-m', 'base');
  execFileSync('git', ['init', '--bare', path.join(root, 'origin')], { stdio: 'pipe' });
  qaGit(dev, 'remote', 'add', 'origin', path.join(root, 'origin'));
  const state = startQaWorkspace({ repoRoot: dev, volumeRoot: root, worktreePath: path.join(root, 'qa'),
    owner: 'qa-owner', verifyVolume: value => value });
  const cwd = state.worktreePath;
  const calls = [];
  const active = [];
  const green = [];
  const identity = { head_branch: 'codex/qa', head_sha: state.base };
  const runner = vi.fn(async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === 'gh' && args[0] === 'auth') return { code: 0, stdout: '', stderr: '' };
    if (command === 'gh' && args[0] === 'repo') return { code: 0, stderr: '',
      stdout: JSON.stringify({ nameWithOwner: 'example/repo', defaultBranchRef: { name: 'dev' } }) };
    if (command === 'git') {
      try { return { code: 0, stdout: qaGit(cwd, ...args), stderr: '' }; }
      catch { return { code: 1, stdout: '', stderr: 'git failed' }; }
    }
    const endpoint = args.find(value => value.startsWith('repos/'));
    let result;
    if (endpoint?.includes('status=success')) result = green.length ? green : [{
      head_sha: state.base, display_title: `Dev Quality Check (full) @ ${state.base.slice(0, 9)}`
    }];
    else if (endpoint?.includes('runs?branch')) result = { workflow_runs: active };
    else if (endpoint?.endsWith('/dispatches')) result = { workflow_run_id: 42, html_url: 'https://github.test/runs/42' };
    else if (endpoint?.endsWith('/runs/42')) result = identity;
    else throw new Error(`Unexpected call ${args.join(' ')}`);
    return { code: 0, stderr: '', stdout: JSON.stringify(result) };
  });
  const preflight = vi.fn(async () => {});
  const monitor = vi.fn(async () => ({ failed: false, jobs: [] }));
  const readVerdict = vi.fn(async () => ({ kind: 'full', verdict: 'passed', accepted_sha: identity.head_sha }));
  return { cwd, dev, calls, active, green, identity, preflight, monitor, readVerdict,
    options: { cwd, repo: 'example/repo', runner, args: { scope: 'full' }, preflight, monitor, readVerdict } };
}

it('pushes and checks the registered QA snapshot while dev continues independently', async () => {
  const f = fixture();
  writeFileSync(path.join(f.dev, 'new-feature'), 'development');
  qaGit(f.dev, 'add', 'new-feature');
  qaGit(f.dev, 'commit', '-m', 'feature');
  const result = await runRemoteQuality({ args: ['--scope', 'full'], cwd: f.cwd,
    runner: f.options.runner, qaPreflight: f.preflight, qaMonitor: f.monitor, readChainVerdict: f.readVerdict });
  const dispatch = f.calls.find(call => call.args.includes('--method'));
  expect(JSON.parse(dispatch.options.input)).toEqual({ ref: 'codex/qa', inputs: {
    scope: 'full', target_sha: f.identity.head_sha, trigger_short: f.identity.head_sha.slice(0, 9)
  } });
  expect(qaGit(f.cwd, 'ls-remote', 'origin', 'refs/heads/codex/qa')).toContain(f.identity.head_sha);
  expect(f.preflight).toHaveBeenCalledWith(expect.objectContaining({ targetSha: f.identity.head_sha, base: f.identity.head_sha }));
  expect(result.sourceRef).toBe('refs/heads/codex/qa');
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
  f.active.push({ id: 33, head_branch: 'codex/qa', head_sha: 'b'.repeat(40),
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
