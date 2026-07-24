// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  hasCompletedFullRemoteValidation,
  resolveT5Admission,
  shouldRunT5
} from './t5-remote-quality-admission.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function run(overrides = {}) {
  return {
    conclusion: 'success',
    display_title: `Remote Quality (full) @ ${SHA}`,
    status: 'completed',
    ...overrides
  };
}

describe('T5 Remote Quality admission', () => {
  it('skips only a scheduled duplicate of a completed full validation', () => {
    expect(hasCompletedFullRemoteValidation([run()], SHA)).toBe(true);
    expect(shouldRunT5({ eventName: 'schedule', runs: [run()], targetSha: SHA })).toBe(false);
    expect(shouldRunT5({ eventName: 'workflow_dispatch', runs: [run()], targetSha: SHA })).toBe(true);
  });

  it('keeps different, scoped, canceled, and active validations', () => {
    for (const candidate of [
      run({ display_title: `Remote Quality (desktop) @ ${SHA}` }),
      run({ display_title: 'Remote Quality (full) @ another-sha' }),
      run({ conclusion: 'cancelled' }),
      run({ conclusion: '', status: 'in_progress' })
    ]) expect(hasCompletedFullRemoteValidation([candidate], SHA)).toBe(false);
  });

  it('reads Remote Quality history only for scheduled T5', async () => {
    const runner = vi.fn(async () => ({
      code: 0, stderr: '', stdout: JSON.stringify({ workflow_runs: [run()] })
    }));
    const baseEnv = {
      FOLIOLE_QUALITY_REPOSITORY: 'campfirium/foliole',
      FOLIOLE_QUALITY_TARGET_SHA: SHA
    };
    await expect(resolveT5Admission({
      env: { ...baseEnv, FOLIOLE_QUALITY_EVENT: 'schedule' }, runner
    })).resolves.toBe(false);
    await expect(resolveT5Admission({
      env: { ...baseEnv, FOLIOLE_QUALITY_EVENT: 'workflow_dispatch' }, runner
    })).resolves.toBe(true);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
