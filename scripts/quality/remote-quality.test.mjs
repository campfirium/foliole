// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { parseRemoteQualityArgs, runRemoteQuality } from './remote-quality.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function createRunner({ dispatchCode = 0, dispatchError = '', authCode = 0, watchCode = 0 } = {}) {
  const calls = [];
  const runner = vi.fn(async (command, args, options = {}) => {
    calls.push({ args, command, options });
    if (command === 'git') return { code: 0, stderr: '', stdout: `${SHA}\n` };
    if (args[0] === 'auth') return { code: authCode, stderr: authCode ? 'not logged in' : '', stdout: '' };
    if (args[0] === 'repo') {
      return { code: 0, stderr: '', stdout: JSON.stringify({
        defaultBranchRef: { name: 'dev' }, nameWithOwner: 'campfirium/foliole'
      }) };
    }
    if (args[0] === 'api' && args.includes('--method')) {
      return { code: dispatchCode, stderr: dispatchError, stdout: dispatchCode ? '' : JSON.stringify({
        html_url: 'https://github.test/runs/42', workflow_run_id: 42
      }) };
    }
    if (args[0] === 'api') return { code: 0, stderr: '', stdout: `${SHA}\n` };
    if (args[0] === 'run' && args[1] === 'watch') return { code: watchCode, stderr: '', stdout: '' };
    return { code: 0, stderr: '', stdout: '' };
  });
  return { calls, runner };
}

describe('remote quality dispatcher', () => {
  it('accepts only an explicit hosted scope', () => {
    expect(parseRemoteQualityArgs(['--scope', 'ios'])).toEqual({ scope: 'ios', sha: '' });
    expect(() => parseRemoteQualityArgs(['--scope', 'mid'])).toThrow('--scope must be');
    expect(() => parseRemoteQualityArgs(['--scope', 'ios', '--unknown'])).toThrow('Unknown argument');
  });

  it('verifies the immutable remote SHA, dispatches, and watches the returned run id', async () => {
    const { calls, runner } = createRunner();
    await expect(runRemoteQuality({ args: ['--scope', 'desktop'], runner })).resolves.toMatchObject({
      runId: 42, scope: 'desktop', sha: SHA
    });
    expect(calls[0].args).toEqual(['auth', 'status', '--hostname', 'github.com']);
    const dispatch = calls.find((call) => call.args.includes('--method'));
    expect(dispatch.args).toContain('X-GitHub-Api-Version: 2026-03-10');
    expect(JSON.parse(dispatch.options.input)).toEqual({
      inputs: { scope: 'desktop', target_sha: SHA }, ref: 'dev'
    });
    expect(calls.some((call) => call.args.includes('watch') && call.args.includes('42'))).toBe(true);
  });

  it('prints failed logs and preserves a failing exit when the hosted run fails', async () => {
    const { calls, runner } = createRunner({ watchCode: 1 });
    await expect(runRemoteQuality({ args: ['--scope', 'shared', '--sha', SHA], runner }))
      .rejects.toThrow('Remote shared quality failed');
    expect(calls.some((call) => call.args.includes('view') && call.args.includes('--log-failed'))).toBe(true);
  });

  it('hard-fails before dispatch when the commit is not on the remote', async () => {
    const { runner } = createRunner();
    runner.mockImplementationOnce(async () => ({
      code: 0, stderr: '', stdout: ''
    }));
    runner.mockImplementationOnce(async () => ({
      code: 0, stderr: '', stdout: JSON.stringify({ defaultBranchRef: { name: 'dev' }, nameWithOwner: 'o/r' })
    }));
    runner.mockImplementationOnce(async () => ({ code: 0, stderr: '', stdout: `${SHA}\n` }));
    runner.mockImplementationOnce(async () => ({ code: 1, stderr: 'Not Found', stdout: '' }));
    await expect(runRemoteQuality({ args: ['--scope', 'full'], runner })).rejects.toThrow('Not Found');
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
