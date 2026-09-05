// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  findActiveHostedQualityRuns,
  monitorRemoteQualityJobs,
  parseRemoteQualityArgs,
  runRemoteQuality
} from './remote-quality.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function job(overrides = {}) {
  return {
    conclusion: 'success', html_url: 'https://github.test/jobs/7', id: 7,
    name: 'Common quality', status: 'completed', ...overrides
  };
}

function createRunner({
  authCode = 0,
  dispatchCode = 0,
  dispatchError = '',
  activeRuns = [],
  jobSnapshots = [[job()]],
  logCodes = [0],
  runSnapshots = [{ conclusion: 'success', status: 'completed' }]
} = {}) {
  const calls = [];
  let jobsIndex = 0;
  let logsIndex = 0;
  let runsIndex = 0;
  const runner = vi.fn(async (command, args, options = {}) => {
    calls.push({ args, command, options });
    if (command === 'git') return { code: 0, stderr: '', stdout: 'dev\n' };
    if (args[0] === 'auth') return { code: authCode, stderr: authCode ? 'not logged in' : '', stdout: '' };
    if (args[0] === 'repo') {
      return { code: 0, stderr: '', stdout: JSON.stringify({
        defaultBranchRef: { name: 'dev' }, nameWithOwner: 'campfirium/foliole'
      }) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.includes('/runs?branch='))) {
      return { code: 0, stderr: '', stdout: JSON.stringify({ workflow_runs: activeRuns }) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.includes('/dispatches'))) {
      return { code: dispatchCode, stderr: dispatchError, stdout: dispatchCode ? '' : JSON.stringify({
        html_url: 'https://github.test/runs/42', workflow_run_id: 42
      }) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.includes('/actions/runs/42/jobs'))) {
      const snapshot = jobSnapshots[Math.min(jobsIndex, jobSnapshots.length - 1)];
      jobsIndex += 1;
      const pages = Array.isArray(snapshot[0]) ? snapshot : [snapshot];
      return { code: 0, stderr: '', stdout: JSON.stringify(pages.map((jobs) => ({ jobs }))) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.endsWith('/actions/runs/42'))) {
      const snapshot = runSnapshots[Math.min(runsIndex, runSnapshots.length - 1)];
      runsIndex += 1;
      return { code: 0, stderr: '', stdout: JSON.stringify(snapshot) };
    }
    if (args[0] === 'api' && args.some((arg) => arg.includes('/actions/jobs/'))) {
      const code = logCodes[Math.min(logsIndex, logCodes.length - 1)];
      logsIndex += 1;
      return { code, stderr: code ? 'logs not ready' : '', stdout: code ? '' : 'failed log' };
    }
    if (args[0] === 'api') return { code: 0, stderr: '', stdout: `${SHA}\n` };
    return { code: 0, stderr: '', stdout: '' };
  });
  return { calls, runner };
}

describe('remote quality dispatcher', () => {
  it('accepts only an explicit hosted scope', () => {
    expect(parseRemoteQualityArgs(['--scope', 'ios'])).toEqual({ scope: 'ios' });
    expect(() => parseRemoteQualityArgs(['--scope', 'mid'])).toThrow('--scope must be');
    expect(() => parseRemoteQualityArgs(['--scope', 'ios', '--sha', SHA])).toThrow('Unknown argument');
    expect(() => parseRemoteQualityArgs(['--scope', 'ios', '--unknown'])).toThrow('Unknown argument');
  });

  it('dispatches the selected scope on dev and monitors the returned run id', async () => {
    const { calls, runner } = createRunner();
    await expect(runRemoteQuality({ args: ['--scope', 'desktop'], runner })).resolves.toMatchObject({
      runId: 42, scope: 'desktop'
    });
    expect(calls[0].args).toEqual(['auth', 'status', '--hostname', 'github.com']);
    const dispatch = calls.find((call) => call.args.includes('--method'));
    expect(dispatch.args).toContain('X-GitHub-Api-Version: 2026-03-10');
    expect(JSON.parse(dispatch.options.input)).toEqual({
      inputs: { scope: 'desktop', target_sha: SHA }, ref: 'dev'
    });
    expect(calls.some((call) => call.args.includes('.object.sha'))).toBe(true);
    expect(calls.some((call) => call.args.some((arg) => arg.includes('/actions/runs/42/jobs')))).toBe(true);
  });

  it('fails before dispatch when the pushed dev HEAD is not an exact SHA', async () => {
    const { runner: baseRunner } = createRunner();
    const runner = vi.fn(async (command, args, options) => {
      if (args[0] === 'api' && args.includes('.object.sha')) {
        return { code: 0, stderr: '', stdout: 'dev' };
      }
      return baseRunner(command, args, options);
    });
    await expect(runRemoteQuality({ args: ['--scope', 'desktop'], runner }))
      .rejects.toThrow('Remote dev HEAD did not resolve');
    expect(runner.mock.calls.some(([, args]) => args.some((arg) => arg.includes('/dispatches')))).toBe(false);
  });

  it('refuses to dispatch while T7 Hosted Quality or Remote Quality is nonterminal', async () => {
    const activeRun = {
      head_branch: 'dev', html_url: 'https://github.test/runs/41',
      id: 41, name: 'T7 Hosted Quality', run_number: 9, status: 'in_progress'
    };
    const { runner } = createRunner({ activeRuns: [activeRun] });
    await expect(runRemoteQuality({ args: ['--scope', 'full'], runner }))
      .rejects.toThrow('wait for every job to reach a terminal state');
    expect(runner.mock.calls.some(([, args]) => args.some((arg) => arg.includes('/dispatches')))).toBe(false);
  });

  it('filters active hosted quality to the default branch', () => {
    expect(findActiveHostedQualityRuns([[
      { head_branch: 'dev', status: 'queued' },
      { head_branch: 'main', status: 'in_progress' },
      { head_branch: 'dev', status: 'completed' }
    ]], 'dev')).toEqual([{ head_branch: 'dev', status: 'queued' }]);
  });

  it('prints a completed failed job log and preserves a failing exit', async () => {
    const { calls, runner } = createRunner({
      jobSnapshots: [[job({ conclusion: 'failure', name: 'Windows core' })]],
      runSnapshots: [{ conclusion: 'failure', status: 'completed' }]
    });
    await expect(runRemoteQuality({ args: ['--scope', 'shared'], runner }))
      .rejects.toThrow('Remote shared quality failed');
    expect(calls.filter((call) => call.args.some((arg) => arg.includes('/actions/jobs/7/logs')))).toHaveLength(1);
  });

  it('does not read partial logs and retries a completed failure whose log is not ready', async () => {
    const snapshots = [
      [job({ conclusion: null, status: 'queued' })],
      [job({ conclusion: 'failure' }), job({ conclusion: null, id: 8, status: 'in_progress' })],
      [job({ conclusion: 'failure' }), job({ id: 8 })]
    ];
    const { calls, runner } = createRunner({
      jobSnapshots: snapshots,
      logCodes: [1, 0],
      runSnapshots: [
        { conclusion: null, status: 'queued' },
        { conclusion: null, status: 'in_progress' },
        { conclusion: 'failure', status: 'completed' }
      ]
    });
    const result = await monitorRemoteQualityJobs({
      cwd: '.', pollIntervalMs: 0, repo: 'campfirium/foliole', runId: 42, runner, wait: vi.fn()
    });
    expect(result.failed).toBe(true);
    const logCalls = calls.filter((call) => call.args.some((arg) => arg.includes('/actions/jobs/7/logs')));
    expect(logCalls).toHaveLength(2);
    expect(calls.some((call) => call.args.some((arg) => arg.includes('/actions/jobs/8/logs')))).toBe(false);
  });

  it('waits for the workflow run after every currently visible job succeeds', async () => {
    const wait = vi.fn();
    const { runner } = createRunner({
      runSnapshots: [
        { conclusion: null, status: 'in_progress' },
        { conclusion: 'success', status: 'completed' }
      ]
    });
    const result = await monitorRemoteQualityJobs({
      cwd: '.', pollIntervalMs: 0, repo: 'campfirium/foliole', runId: 42, runner, wait
    });
    expect(result.failed).toBe(false);
    expect(wait).toHaveBeenCalledOnce();
  });

  it('uses the workflow conclusion and includes failed jobs from later pages', async () => {
    const { calls, runner } = createRunner({
      jobSnapshots: [[[job()], [job({ conclusion: 'failure', id: 108, name: 'Late page' })]]],
      runSnapshots: [{ conclusion: 'failure', status: 'completed' }]
    });
    const result = await monitorRemoteQualityJobs({
      cwd: '.', repo: 'campfirium/foliole', runId: 42, runner
    });
    expect(result.failed).toBe(true);
    expect(result.jobs).toHaveLength(2);
    expect(calls.some((call) => call.args.includes('--paginate') && call.args.includes('--slurp'))).toBe(true);
    expect(calls.some((call) => call.args.some((arg) => arg.includes('/actions/jobs/108/logs')))).toBe(true);
  });

  it('keeps a successful workflow conclusion when failed-job log retrieval fails', async () => {
    const { runner } = createRunner({
      jobSnapshots: [[job({ conclusion: 'failure' })]], logCodes: [1]
    });
    await expect(monitorRemoteQualityJobs({
      cwd: '.', repo: 'campfirium/foliole', runId: 42, runner
    })).resolves.toMatchObject({ failed: false });
  });

  it.each(['cancelled', 'timed_out', 'neutral', 'skipped'])(
    'does not pass a completed workflow with conclusion %s',
    async (conclusion) => {
      const { runner } = createRunner({ runSnapshots: [{ conclusion, status: 'completed' }] });
      await expect(monitorRemoteQualityJobs({
        cwd: '.', repo: 'campfirium/foliole', runId: 42, runner
      })).resolves.toMatchObject({ failed: true });
    }
  );

  it('hard-fails before dispatch when the local branch is not dev', async () => {
    const { runner } = createRunner();
    runner.mockImplementation(async (command, args) => {
      if (command === 'git') return { code: 0, stderr: '', stdout: 'release\n' };
      if (args[0] === 'auth') return { code: 0, stderr: '', stdout: '' };
      if (args[0] === 'repo') return { code: 0, stderr: '', stdout: JSON.stringify({
        defaultBranchRef: { name: 'dev' }, nameWithOwner: 'o/r'
      }) };
      return { code: 0, stderr: '', stdout: '' };
    });
    await expect(runRemoteQuality({ args: ['--scope', 'full'], runner }))
      .rejects.toThrow('requires the local dev branch');
    expect(runner.mock.calls.some(([, args]) => args.some((arg) => arg.includes('/dispatches')))).toBe(false);
  });

  it('hard-fails before repository lookup when GitHub CLI is not authenticated', async () => {
    const { calls, runner } = createRunner({ authCode: 1 });
    await expect(runRemoteQuality({ args: ['--scope', 'ios'], runner })).rejects.toThrow('not logged in');
    expect(calls).toHaveLength(1);
  });

  it('classifies a forbidden dispatch as a missing Actions write permission', async () => {
    const { runner } = createRunner({ dispatchCode: 1, dispatchError: 'HTTP 403: Forbidden' });
    await expect(runRemoteQuality({ args: ['--scope', 'android'], runner }))
      .rejects.toThrow('GitHub Actions write permission is required');
  });
});
