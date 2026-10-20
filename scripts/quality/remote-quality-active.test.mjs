// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { runRemoteQuality } from './remote-quality.mjs';
import { createRunner, job, SHA } from './remote-quality-test-support.mjs';

const OTHER = 'b'.repeat(40);
const TREE = 'c'.repeat(40);

function activeRun(overrides = {}) {
  return { head_branch: 'dev', head_sha: SHA, html_url: 'https://github.test/runs/42', id: 42,
    path: '.github/workflows/t7-hosted-quality.yml', status: 'in_progress', ...overrides };
}

function manualRun(scope, sha = SHA) {
  return activeRun({ display_title: `Dev Quality Check (${scope}) @ ${sha} via ${OTHER}`,
    head_sha: OTHER, path: '.github/workflows/remote-quality.yml' });
}

const dispatched = (calls) => calls.some((call) => call.args.some((arg) => arg.includes('/dispatches')));
const replayVerdict = () => ({ verdict: 'failed', stages: { 't5-tooling': 'failure' } });

function replayRunner(options) {
  const fixture = createRunner(options);
  const runner = async (command, args, config) => args.includes('repos/campfirium/foliole/actions/runs/123')
    ? { code: 0, stdout: JSON.stringify({ head_sha: OTHER }) }
    : fixture.runner(command, args, config);
  return { ...fixture, runner };
}

describe('remote quality active full chain', () => {
  it.each([['scheduled', activeRun()], ['manual full', manualRun('full')]])(
    'waits on an active %s chain of the same target instead of preflight and dispatch',
    async (_label, run) => {
      const { calls, runner } = createRunner({ activeRuns: [run] });
      const preflight = async () => { throw new Error('preflight must not run'); };
      await expect(runRemoteQuality({ args: ['--scope', 'full'], preflight, runner }))
        .resolves.toMatchObject({ reused: true, runId: 42, url: 'https://github.test/runs/42' });
      expect(dispatched(calls)).toBe(false);
    }
  );

  it('exits with the active run conclusion when it fails', async () => {
    const { calls, runner } = createRunner({ activeRuns: [activeRun()],
      jobSnapshots: [[job({ conclusion: 'failure' })]],
      runSnapshots: [{ conclusion: 'failure', status: 'completed' }] });
    await expect(runRemoteQuality({ args: ['--scope', 'full'], runner }))
      .rejects.toThrow('Remote full quality failed: https://github.test/runs/42');
    expect(dispatched(calls)).toBe(false);
  });

  it('reuses a full chain of another commit only when its tree matches', async () => {
    const same = createRunner({ activeRuns: [manualRun('full', OTHER)], trees: { [SHA]: TREE, [OTHER]: TREE } });
    await expect(runRemoteQuality({ args: ['--scope', 'full'], runner: same.runner }))
      .resolves.toMatchObject({ reused: true });
    const differ = createRunner({ activeRuns: [manualRun('full', OTHER)],
      trees: { [SHA]: TREE, [OTHER]: 'd'.repeat(40) } });
    await expect(runRemoteQuality({ args: ['--scope', 'full'], runner: differ.runner }))
      .resolves.not.toHaveProperty('reused');
    expect(dispatched(differ.calls)).toBe(true);
  });

  it.each([['replay', manualRun('replay')], ['shared', manualRun('shared')],
    ['completed', activeRun({ status: 'completed' })], ['other branch', activeRun({ head_branch: 'main' })]])(
    'does not let an active %s run stand in for a full request', async (_label, run) => {
      const { calls, runner } = createRunner({ activeRuns: [run] });
      await expect(runRemoteQuality({ args: ['--scope', 'full'], runner }))
        .resolves.not.toHaveProperty('reused');
      expect(dispatched(calls)).toBe(true);
    }
  );

  it('dispatches after an attached scheduled run declines through admission', async () => {
    const { calls, runner } = createRunner({ activeRuns: [activeRun()],
      jobSnapshots: [[job({ name: 'Scheduled dev run skipped' })]] });
    await expect(runRemoteQuality({ args: ['--scope', 'full'], runner }))
      .resolves.not.toHaveProperty('reused');
    expect(dispatched(calls)).toBe(true);
  });

  it('keeps narrow scopes dispatching even when a full chain is active', async () => {
    const { calls, runner } = createRunner({ activeRuns: [activeRun()] });
    await runRemoteQuality({ args: ['--scope', 'desktop'], runner });
    expect(dispatched(calls)).toBe(true);
  });

  it('waits on an active full chain for a replay request of the same target', async () => {
    const { calls, runner } = replayRunner({ activeRuns: [manualRun('full')] });
    await expect(runRemoteQuality({ args: ['--replay', '123'], runner, readChainVerdict: replayVerdict }))
      .resolves.toMatchObject({ reused: true });
    expect(dispatched(calls)).toBe(false);
  });

  it('does not let an active replay stand in for another replay request', async () => {
    const { calls, runner } = replayRunner({ activeRuns: [manualRun('replay')] });
    await runRemoteQuality({ args: ['--replay', '123'], runner, readChainVerdict: replayVerdict });
    expect(dispatched(calls)).toBe(true);
  });
});
