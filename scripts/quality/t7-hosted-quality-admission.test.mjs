// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  hasCompletedFullRemoteValidation,
  resolveT7Admission,
  shouldRunT7
} from './t7-hosted-quality-admission.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function run(overrides = {}) {
  return {
    conclusion: 'success',
    display_title: `Remote Quality (full) @ ${SHA}`,
    status: 'completed',
    ...overrides
  };
}

describe('T7 Hosted Quality admission', () => {
  it('skips only a scheduled duplicate of a completed T4 full validation', () => {
    expect(hasCompletedFullRemoteValidation([run()], SHA)).toBe(true);
    expect(shouldRunT7({
      eventName: 'schedule', releaseActive: false, runs: [run()], targetSha: SHA
    })).toBe(false);
    expect(shouldRunT7({
      eventName: 'workflow_dispatch', releaseActive: false, runs: [run()], targetSha: SHA
    })).toBe(true);
  });

  it('keeps different, scoped, canceled, and active validations', () => {
    for (const candidate of [
      run({ display_title: `Remote Quality (desktop) @ ${SHA}` }),
      run({ display_title: 'Remote Quality (full) @ another-sha' }),
      run({ conclusion: 'cancelled' }),
      run({ conclusion: '', status: 'in_progress' })
    ]) expect(hasCompletedFullRemoteValidation([candidate], SHA)).toBe(false);
  });

  it('pauses every dev entry while the release branch exists', async () => {
    const runner = vi.fn(async () => ({ code: 0, stderr: '', stdout: '{}' }));
    const baseEnv = {
      FOLIOLE_QUALITY_REPOSITORY: 'campfirium/foliole',
      FOLIOLE_QUALITY_TARGET_SHA: SHA
    };
    await expect(resolveT7Admission({
      env: { ...baseEnv, FOLIOLE_QUALITY_EVENT: 'schedule' }, runner
    })).resolves.toEqual({ reason: 'release-active', shouldRun: false });
    await expect(resolveT7Admission({
      env: { ...baseEnv, FOLIOLE_QUALITY_EVENT: 'workflow_dispatch' }, runner
    })).resolves.toEqual({ reason: 'release-active', shouldRun: false });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls.every(([, args]) => args.some((arg) => arg.includes('/git/ref/heads/release'))))
      .toBe(true);
  });

  it('checks T4 history only for a scheduled T7 without a release', async () => {
    const runner = vi.fn(async (_command, args) => {
      if (args.some((arg) => arg.includes('/git/ref/heads/release'))) {
        return { code: 1, stderr: 'HTTP 404: Not Found', stdout: '' };
      }
      return { code: 0, stderr: '', stdout: JSON.stringify({ workflow_runs: [run()] }) };
    });
    const baseEnv = {
      FOLIOLE_QUALITY_REPOSITORY: 'campfirium/foliole',
      FOLIOLE_QUALITY_TARGET_SHA: SHA
    };
    await expect(resolveT7Admission({
      env: { ...baseEnv, FOLIOLE_QUALITY_EVENT: 'schedule' }, runner
    })).resolves.toEqual({ reason: 'duplicate-full-validation', shouldRun: false });
    await expect(resolveT7Admission({
      env: { ...baseEnv, FOLIOLE_QUALITY_EVENT: 'workflow_dispatch' }, runner
    })).resolves.toEqual({ reason: 'admitted', shouldRun: true });
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it('fails closed when release state cannot be read', async () => {
    const runner = vi.fn(async () => ({
      code: 1, stderr: 'HTTP 403: Resource not accessible by integration', stdout: ''
    }));
    await expect(resolveT7Admission({
      env: {
        FOLIOLE_QUALITY_EVENT: 'schedule',
        FOLIOLE_QUALITY_REPOSITORY: 'campfirium/foliole',
        FOLIOLE_QUALITY_TARGET_SHA: SHA
      },
      runner
    })).rejects.toThrow('failed to read release ref');
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
