import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { qaGit } from './qa-workspace-state.mjs';
import { startQaWorkspace } from './qa-workspace.mjs';

export const roots = [];

export function fixture() {
  const artifacts = path.resolve('.tmp/artifacts/T682/remote-fixtures');
  mkdirSync(artifacts, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(artifacts, 'qa-')));
  roots.push(root);
  const dev = path.join(root, 'dev');
  execFileSync('git', ['init', '-b', 'dev', dev], { stdio: 'pipe' });
  qaGit(dev, 'config', 'user.name', 'Test');
  qaGit(dev, 'config', 'user.email', 'test@example.com');
  qaGit(dev, 'config', 'core.fsmonitor', 'false');
  writeFileSync(path.join(dev, '.gitignore'), '.tmp/\n.cache/\n.lab/\nscripts\nsrc\nlib\nAGENTS.local.md\n');
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
  const identity = { head_branch: 'check', head_sha: state.base };
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
