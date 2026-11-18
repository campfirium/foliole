// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { waitForQaWithRunnerRetries } from './qa-runner-retry.mjs';

const targetSha = 'd'.repeat(40);
const repo = 'example/foliole';
const runId = 42;
const noRunner = { id: 7, name: 'iOS app compile', status: 'completed', conclusion: 'cancelled', runner_id: 0, steps: [] };
const verdict = { id: 8, name: 'full-quality / quality-admission / verdict', status: 'completed', conclusion: 'failure' };
const missingAnnotation = { annotation_level: 'failure', message: 'The job was not acquired by Runner of type hosted even after multiple attempts' };

function fixture({ failedAttempts = 1, jobs = [noRunner, verdict], annotations = [missingAnnotation] } = {}) {
  let attempt = 1;
  const current = () => ({ head_sha: targetSha, head_branch: 'review', run_attempt: attempt,
    status: 'completed', conclusion: attempt <= failedAttempts ? 'failure' : 'success', updated_at: new Date().toISOString() });
  const monitor = vi.fn(async ({ minimumAttempt }) => {
    if (minimumAttempt) expect(attempt).toBe(minimumAttempt);
    return { failed: attempt <= failedAttempts, jobs, run: current() };
  });
  const runner = vi.fn(async (command, args) => {
    expect(command).toBe('gh');
    if (args[0] === 'run') {
      expect(args).toEqual(['run', 'rerun', String(runId), '-R', repo, '--failed']);
      attempt++;
      return { code: 0, stdout: '' };
    }
    const data = args[1].endsWith('/annotations') ? annotations : current();
    return { code: 0, stdout: JSON.stringify(data) };
  });
  return { monitor, runner, retryWait: vi.fn(async () => {}), assertCandidate: vi.fn(),
    cwd: '/qa', branch: 'review', repo, targetSha, runId };
}

it('keeps rerunning only failed jobs on the same run and backs off past three attempts', async () => {
  const options = fixture({ failedAttempts: 5 });
  expect((await waitForQaWithRunnerRetries(options)).run.run_attempt).toBe(6);
  expect(options.runner.mock.calls.filter(([, args]) => args[0] === 'run')).toHaveLength(5);
  expect(options.retryWait.mock.calls.map(([ms]) => Math.round(ms / 60_000))).toEqual([5, 15, 30, 60, 60]);
});

it.each([
  { jobs: [noRunner, verdict, { ...noRunner, id: 9, conclusion: 'failure', runner_id: 3, steps: [{ name: 'Compile' }] }] },
  { annotations: [{ annotation_level: 'failure', message: 'Cancelled by maintainer' }] },
  { jobs: [verdict] }
])('keeps failures without positive runner-allocation evidence terminal', async (overrides) => {
  const options = fixture(overrides);
  expect((await waitForQaWithRunnerRetries(options)).failed).toBe(true);
  expect(options.retryWait).not.toHaveBeenCalled();
  expect(options.runner.mock.calls.some(([, args]) => args[0] === 'run')).toBe(false);
});

it('checks ownership again after the backoff before retrying', async () => {
  const options = fixture();
  options.assertCandidate.mockImplementation(() => { throw new Error('QA candidate changed'); });
  await expect(waitForQaWithRunnerRetries(options)).rejects.toThrow('QA candidate changed');
  expect(options.runner.mock.calls.some(([, args]) => args[0] === 'run')).toBe(false);
});
