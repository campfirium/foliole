// @vitest-environment node
import { rmSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { fixture, roots } from './qa-remote-test-support.mjs';
import { runRemoteQuality } from './remote-quality.mjs';
import { runQaRemoteQuality } from './qa-remote-quality.mjs';
import { readQaWorkspace } from './qa-workspace-state.mjs';
import { parseRemoteQualityArgs } from './remote-quality-args.mjs';

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const args = { scope: 'full', mobileDistribution: 'ios' };

it('dispatches explicit iPhone distribution on the registered QA candidate and recovers that run', async () => {
  const f = fixture();
  const options = { ...f.options, args };
  const first = await runQaRemoteQuality(options);
  const second = await runQaRemoteQuality(options);
  expect(first).toMatchObject({ mobileDistribution: 'ios', targetSha: f.identity.head_sha });
  expect(second.runId).toBe(first.runId);
  const dispatches = f.calls.filter(call => call.args.includes('--method'));
  expect(dispatches).toHaveLength(1);
  expect(JSON.parse(dispatches[0].options.input)).toEqual({ ref: 'check', inputs: {
    scope: 'full', mobile_distribution: 'ios', target_sha: f.identity.head_sha,
    trigger_short: f.identity.head_sha.slice(0, 9)
  } });
  expect(readQaWorkspace(f.cwd).run).toMatchObject({ passed: true, mobileDistribution: 'ios' });
});

it('does not treat an ordinary full pass as an uploaded build', async () => {
  const f = fixture();
  await runQaRemoteQuality(f.options);
  await runQaRemoteQuality({ ...f.options, args });
  expect(f.calls.filter(call => call.args.includes('--method'))).toHaveLength(2);
});

it('does not adopt an active ordinary QA run as a distribution run', async () => {
  const f = fixture();
  f.active.push({ id: 33, head_branch: 'check', head_sha: f.identity.head_sha,
    display_title: `Dev Quality Check (full) @ ${f.identity.head_sha.slice(0, 9)}`,
    status: 'in_progress', html_url: 'https://github.test/runs/33' });
  await expect(runQaRemoteQuality({ ...f.options, args })).rejects.toThrow(/already has an active/u);
  expect(f.calls.some(call => call.args.includes('--method'))).toBe(false);
});

it('preserves a failed upload or quality run without claiming distribution passed', async () => {
  const f = fixture();
  f.monitor.mockResolvedValue({ failed: true, jobs: [] });
  await expect(runQaRemoteQuality({ ...f.options, args })).rejects.toThrow(/failed/u);
  expect(readQaWorkspace(f.cwd).run).toMatchObject({ mobileDistribution: 'ios' });
  expect(readQaWorkspace(f.cwd).run.passed).toBeUndefined();
});

it('preserves the distribution choice after an ambiguous dispatch', async () => {
  const f = fixture();
  const runner = async (command, values, options) => values.includes('--method')
    ? { code: 1, stderr: 'EOF', stdout: '' } : f.options.runner(command, values, options);
  await expect(runQaRemoteQuality({ ...f.options, args, runner })).rejects.toThrow(/EOF/u);
  expect(readQaWorkspace(f.cwd).dispatchPending).toMatchObject({ mobileDistribution: 'ios' });
  await expect(runQaRemoteQuality({ ...f.options, runner })).rejects.toThrow(/original request/u);
});

it('recovers the matching distribution dispatch without creating another upload', async () => {
  const f = fixture();
  let uncertain = true;
  const runner = async (command, values, options) => {
    if (uncertain && values.includes('--method')) return { code: 1, stderr: 'EOF', stdout: '' };
    return f.options.runner(command, values, options);
  };
  await expect(runQaRemoteQuality({ ...f.options, args, runner })).rejects.toThrow(/EOF/u);
  uncertain = false;
  f.active.push({ id: 42, head_branch: 'check', head_sha: f.identity.head_sha,
    display_title: `Dev Quality Check (full) @ ${f.identity.head_sha.slice(0, 9)} [mobile:ios]`,
    created_at: '2999-01-01T00:00:00Z', status: 'in_progress', html_url: 'https://github.test/runs/42' });
  await expect(runQaRemoteQuality({ ...f.options, args, runner })).resolves.toMatchObject({ runId: 42 });
  expect(f.calls.some(call => call.args.includes('--method'))).toBe(false);
});

it('rejects unsupported platforms, narrow checks, replay and preflight bypass', () => {
  expect(parseRemoteQualityArgs(['--scope', 'full', '--mobile-distribution', 'ios'])).toMatchObject(args);
  for (const values of [
    ['--scope', 'ios', '--mobile-distribution', 'ios'],
    ['--scope', 'full', '--mobile-distribution', 'android'],
    ['--scope', 'full', '--mobile-distribution', 'ios', '--skip-preflight'],
    ['--replay', '42', '--mobile-distribution', 'ios']
  ]) expect(() => parseRemoteQualityArgs(values)).toThrow();
});

it('rejects mobile distribution from development rather than sending it on dev', async () => {
  const f = fixture();
  const runner = async (command, values, options) => command === 'git' && values[0] === 'branch'
    ? { code: 0, stdout: 'dev', stderr: '' } : f.options.runner(command, values, options);
  await expect(runRemoteQuality({ args: ['--scope', 'full', '--mobile-distribution', 'ios'],
    cwd: f.dev, runner })).rejects.toThrow(/registered check/u);
  expect(f.calls.some(call => call.args.includes('--method'))).toBe(false);
});
