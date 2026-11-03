// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runQaMobileResume } from './qa-mobile-resume.mjs';
import { parseRemoteQualityArgs } from './remote-quality-args.mjs';
import { qaGit, readQaWorkspace } from './qa-workspace-state.mjs';
import { saveQaRecord } from './qa-workspace-integration.mjs';
import { startQaWorkspace } from './qa-workspace.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const parent = path.resolve('.tmp/artifacts/T707-3'); mkdirSync(parent, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(parent, 'resume-'))); roots.push(root);
  const dev = path.join(root, 'dev'); execFileSync('git', ['init', '-b', 'dev', dev], { stdio: 'pipe' });
  qaGit(dev, 'config', 'user.name', 'Test'); qaGit(dev, 'config', 'user.email', 'test@example.com');
  qaGit(dev, 'config', 'core.fsmonitor', 'false');
  writeFileSync(path.join(dev, '.gitignore'), '.tmp/\n.cache/\n.lab/\nAGENTS.local.md\n');
  writeFileSync(path.join(dev, 'product'), 'unchanged'); qaGit(dev, 'add', '.'); qaGit(dev, 'commit', '-m', 'base');
  const state = startQaWorkspace({ repoRoot: dev, worktreePath: path.join(root, 'check'),
    volumeRoot: root, owner: 'original-owner', verifyVolume: value => value });
  const cwd = state.worktreePath; const sourceSha = qaGit(cwd, 'rev-parse', 'HEAD');
  const calls = [];
  const response = { workflow_run_id: 88, html_url: 'https://github.com/owner/repo/actions/runs/88' };
  const runner = vi.fn(async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'git') return { code: 0, stdout: '', stderr: '' };
    if (args.includes('--method')) return { code: 0,
      stdout: args.includes('X-GitHub-Api-Version: 2026-03-10') ? JSON.stringify(response) : '', stderr: '' };
    if (args.some(arg => arg.includes('runs?branch='))) return { code: 0, stdout: '{"workflow_runs":[]}', stderr: '' };
    return { code: 0, stdout: JSON.stringify({ head_branch: 'check', head_sha: sourceSha,
      display_title: `Dev Quality Check (mobile_resume) @ ${sourceSha.slice(0, 9)} [mobile:ios] [reuse:42]` }), stderr: '' };
  });
  const options = { args: parseRemoteQualityArgs(['--scope', 'full', '--mobile-distribution', 'ios', '--reuse-mobile-quality', '42']),
    cwd, repo: 'owner/repo', runner, validate: vi.fn(async () => {}), readQuality: vi.fn(),
    readCompleted: vi.fn(), monitor: vi.fn(async () => ({ failed: false })) };
  return { dev, cwd, sourceSha, calls, response, options };
}

it('dispatches only distribution reuse, preserves original quality identity and records verified completion', async () => {
  const f = fixture();
  await runQaMobileResume(f.options);
  expect(f.options.readQuality).toHaveBeenCalledWith(expect.objectContaining({ qualityRunId: '42', sourceSha: f.sourceSha }));
  expect(f.options.validate).toHaveBeenCalledOnce();
  const post = f.calls.find(call => call.args.includes('--method'));
  expect(JSON.parse(post.options.input)).toEqual({ ref: 'check', inputs: { scope: 'full',
    target_sha: f.sourceSha, trigger_short: f.sourceSha.slice(0, 9), mobile_distribution: 'ios', mobile_quality_run_id: '42' } });
  expect(readQaWorkspace(f.dev)).toMatchObject({ owner: 'original-owner', run: {
    scope: 'mobile-resume', qualityRunId: '42', targetSha: f.sourceSha, runId: 88, passed: true } });
});

it('recovers the owned run without another push, preflight or dispatch', async () => {
  const f = fixture(); const record = readQaWorkspace(f.dev);
  record.run = { scope: 'mobile-resume', qualityRunId: '42', targetSha: f.sourceSha, runId: 88, url: 'existing' };
  saveQaRecord(record);
  await runQaMobileResume(f.options);
  expect(f.options.validate).not.toHaveBeenCalled();
  expect(f.calls.some(call => call.command === 'git' || call.args.includes('--method'))).toBe(false);
  expect(f.options.monitor).toHaveBeenCalledWith(expect.objectContaining({ runId: 88 }));
});

it('does not dispatch when original quality or product equivalence fails', async () => {
  const f = fixture(); f.options.readQuality.mockImplementation(() => { throw new Error('product differs'); });
  await expect(runQaMobileResume(f.options)).rejects.toThrow('product differs');
  expect(f.options.validate).not.toHaveBeenCalled();
  expect(f.calls.some(call => call.args.includes('--method'))).toBe(false);
});

it('keeps an ambiguous dispatch pending and refuses to dispatch it twice', async () => {
  const f = fixture(); delete f.response.workflow_run_id;
  await expect(runQaMobileResume(f.options)).rejects.toThrow('Dispatch response is unknown');
  await expect(runQaMobileResume(f.options)).rejects.toThrow('Pending mobile dispatch has no identified run');
  expect(f.calls.filter(call => call.args.includes('--method'))).toHaveLength(1);
});

it('does not mark failed distribution as passed', async () => {
  const f = fixture(); f.options.monitor.mockResolvedValue({ failed: true });
  await expect(runQaMobileResume(f.options)).rejects.toThrow('Mobile distribution failed');
  expect(readQaWorkspace(f.dev).run.passed).not.toBe(true);
});

it('runs full quality normally and skips it only for verified mobile reuse', () => {
  const workflow = parse(readFileSync('.github/workflows/remote-quality.yml', 'utf8'));
  const evaluate = (condition, inputs, needs = {}) => vm.runInNewContext(condition
    .replaceAll('always()', 'true').replace(/needs\.([\w-]+)\.result/gu, 'needs["$1"].result'), { inputs, needs });
  const inputs = { scope: 'full', mobile_distribution: 'ios', mobile_quality_run_id: '' };
  expect(evaluate(workflow.jobs['full-quality'].if, inputs, { 'dev-ref': { result: 'success' } })).toBe(true);
  inputs.mobile_quality_run_id = '42';
  expect(evaluate(workflow.jobs['full-quality'].if, inputs, { 'dev-ref': { result: 'success' } })).toBe(false);
  expect(evaluate(workflow.jobs['mobile-reuse'].if, inputs, { 'dev-ref': { result: 'success' } })).toBe(true);
  const needs = { 'full-quality': { result: 'skipped' }, 'mobile-reuse': { result: 'failure' } };
  expect(evaluate(workflow.jobs['mobile-context'].if, inputs, needs)).toBe(false);
  needs['mobile-reuse'].result = 'success';
  expect(evaluate(workflow.jobs['mobile-context'].if, inputs, needs)).toBe(true);
  expect(workflow.jobs['mobile-ios'].with.quality_evidence_artifact).toContain('needs.mobile-reuse.outputs.artifact');
});
