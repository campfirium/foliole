// @vitest-environment node
import { rmSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { fixture, roots } from './qa-remote-test-support.mjs';
import { runQaRemoteQuality } from './qa-remote-quality.mjs';
import { readQaWorkspace } from './qa-workspace-state.mjs';

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const args = { scope: 'full', mobileDistribution: 'android' };

it('dispatches and recovers Android on the same registered QA source without repeating delivery', async () => {
  const f = fixture();
  const first = await runQaRemoteQuality({ ...f.options, args });
  const second = await runQaRemoteQuality({ ...f.options, args });
  expect(second.runId).toBe(first.runId);
  const dispatches = f.calls.filter(call => call.args.includes('--method'));
  expect(dispatches).toHaveLength(1);
  expect(JSON.parse(dispatches[0].options.input).inputs).toMatchObject({
    mobile_distribution: 'android', scope: 'full', target_sha: f.identity.head_sha
  });
  expect(readQaWorkspace(f.cwd).run).toMatchObject({ mobileDistribution: 'android', passed: true });
});

it('preserves unknown Android dispatches and refuses another channel while delivery is unresolved', async () => {
  const f = fixture();
  const runner = async (command, values, options) => values.includes('--method')
    ? { code: 1, stderr: 'EOF', stdout: '' } : f.options.runner(command, values, options);
  await expect(runQaRemoteQuality({ ...f.options, args, runner })).rejects.toThrow('EOF');
  expect(readQaWorkspace(f.cwd).dispatchPending.mobileDistribution).toBe('android');
  await expect(runQaRemoteQuality({ ...f.options, runner })).rejects.toThrow(/original request/u);
  f.active.push({ id: 42, head_branch: 'check', head_sha: f.identity.head_sha,
    display_title: `Dev Quality Check (full) @ ${f.identity.head_sha.slice(0, 9)} [mobile:android]`,
    created_at: '2999-01-01T00:00:00Z', status: 'in_progress', html_url: 'https://github.test/runs/42' });
  await expect(runQaRemoteQuality({ ...f.options, args, runner })).resolves.toMatchObject({ runId: 42 });
});
