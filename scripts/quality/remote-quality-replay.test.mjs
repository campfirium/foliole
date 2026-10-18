// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { parseRemoteQualityArgs, runRemoteQuality } from './remote-quality.mjs';
import { assertNoActiveFullReplay, resolveReplayStages, selectReplayStages } from './remote-quality-replay.mjs';
import { createRunner, SHA } from './remote-quality-test-support.mjs';

it('requires exactly one scope or numeric replay source', () => {
  expect(parseRemoteQualityArgs(['--replay', '123'])).toMatchObject({ scope: 'replay', replay: '123' });
  for (const args of [['--replay'], ['--replay', 'x'], ['--replay', '0'],
    ['--replay', '123', '--scope', 'full']]) {
    expect(() => parseRemoteQualityArgs(args)).toThrow();
  }
});

it('selects only failed and cancelled stages, including a tail alone', () => {
  expect(selectReplayStages({ verdict: 'failed', stages: {
    't5-tooling': 'failure', 't5-static': 'success', 't6-ios-contract': 'cancelled',
    't6-android-host': 'skipped'
  } })).toEqual(['t5-tooling', 't6-ios-contract']);
  expect(selectReplayStages({ verdict: 'incomplete', stages: { 't6-ios-contract': 'cancelled' } }))
    .toEqual(['t6-ios-contract']);
});

it.each([
  [{ verdict: 'incomplete' }, 'No usable'],
  [{ verdict: 'passed', stages: { 't5-static': 'success' } }, 'passed'],
  [{ verdict: 'failed', stages: { 't5-static': 'success' } }, 'No failed'],
  [{ verdict: 'failed', stages: { 'unknown-stage': 'failure' } }, 'Unknown']
])('rejects unusable replay evidence %j', (receipt, message) => {
  expect(() => selectReplayStages(receipt)).toThrow(message);
});

it('reads source evidence against its original SHA, not the new dev tip', async () => {
  const read = vi.fn(() => ({ verdict: 'failed', stages: { 't5-tooling': 'failure' } }));
  await expect(resolveReplayStages({ repository: 'o/r', runId: '123', read,
    readRun: async () => ({ head_sha: 'b'.repeat(40) }) })).resolves.toBe('t5-tooling');
  expect(read).toHaveBeenCalledWith({ repository: 'o/r', runId: '123', targetSha: 'b'.repeat(40) });
});

it('rejects same-SHA active full from either entry without confusing replay or scoped runs', () => {
  for (const metadata of [{ path: '.github/workflows/t7-hosted-quality.yml' },
    { display_title: 'Remote Quality (full) @ exact via topology' }]) {
    expect(() => assertNoActiveFullReplay([{ head_sha: SHA, ...metadata }], SHA)).toThrow('still active');
    expect(() => assertNoActiveFullReplay([{ head_sha: 'b'.repeat(40), ...metadata }], SHA)).not.toThrow();
  }
  expect(() => assertNoActiveFullReplay([{ head_sha: SHA,
    display_title: 'Remote Quality (replay) @ exact via topology' }], SHA)).not.toThrow();
});

function replayRunner(options) {
  const fixture = createRunner(options);
  const runner = async (command, args, config) => args.includes('repos/campfirium/foliole/actions/runs/123')
    ? { code: 0, stdout: JSON.stringify({ head_sha: 'b'.repeat(40) }) }
    : fixture.runner(command, args, config);
  return { ...fixture, runner };
}

it('dispatches selected stages on current pushed dev and never reruns the old SHA', async () => {
  const { runner, calls } = replayRunner();
  await runRemoteQuality({ args: ['--replay', '123'], runner,
    readChainVerdict: () => ({ verdict: 'failed', stages: { 't6-ios-contract': 'failure' } }) });
  expect(JSON.parse(calls.find(call => call.args.includes('--method')).options.input)).toEqual({
    ref: 'dev', inputs: { scope: 'replay', target_sha: SHA, stages: 't6-ios-contract' }
  });
});

it('never dispatches when the production receipt reader rejects evidence', async () => {
  const { runner, calls } = replayRunner();
  await expect(runRemoteQuality({ args: ['--replay', '123'], runner,
    readChainVerdict: () => ({ verdict: 'incomplete' }) })).rejects.toThrow('No usable');
  expect(calls.some(call => call.args.includes('--method'))).toBe(false);
});

it('refuses dispatch when the current target already has an active full chain', async () => {
  const { runner, calls } = replayRunner({ activeRuns: [{
    head_branch: 'dev', head_sha: SHA, status: 'in_progress',
    display_title: `Remote Quality (full) @ ${SHA} via ${SHA}`
  }] });
  await expect(runRemoteQuality({ args: ['--replay', '123'], runner,
    readChainVerdict: () => ({ verdict: 'failed', stages: { 't5-tooling': 'failure' } }) }))
    .rejects.toThrow('A full chain');
  expect(calls.some(call => call.args.includes('--method'))).toBe(false);
});
