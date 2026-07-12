// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';

import { verifyWindowsCiContext, writeWindowsCiEvidence } from './windows-ci-evidence.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function createEnv(overrides = {}) {
  return {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/dev',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_RUN_ID: '9001',
    GITHUB_SHA: SHA,
    CONTEXT_OUTCOME: 'success',
    RUNNER_ARCH: 'X64',
    RUNNER_OS: 'Windows',
    NPM_CI_OUTCOME: 'success',
    NATIVE_ABI_OUTCOME: 'success',
    WINDOWS_CONTRACT_OUTCOME: 'success',
    DESKTOP_BUILD_OUTCOME: 'success',
    PLAYWRIGHT_OUTCOME: 'success',
    ...overrides
  };
}

describe('Windows CI evidence', () => {
  it('verifies the checked out SHA and Windows x64 runner', () => {
    expect(verifyWindowsCiContext({ env: createEnv(), readHead: () => SHA })).toEqual({
      head: SHA,
      sha: SHA
    });
    expect(() => verifyWindowsCiContext({
      env: createEnv({ RUNNER_ARCH: 'ARM64' }),
      readHead: () => SHA
    })).toThrow('RUNNER_ARCH must be X64');
    expect(() => verifyWindowsCiContext({
      env: createEnv(),
      readHead: () => 'f'.repeat(40)
    })).toThrow('HEAD does not match GITHUB_SHA');
  });

  it('writes human-readable SHA, suite, and step outcomes to the evidence whitelist', () => {
    const fsApi = {
      appendFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn()
    };
    const result = writeWindowsCiEvidence({
      env: createEnv({ GITHUB_STEP_SUMMARY: 'summary.md', PLAYWRIGHT_OUTCOME: 'failure' }),
      fsApi,
      readHead: () => SHA
    });
    expect(result.evidencePath).toContain(path.normalize('.tmp/artifacts/windows-ci-evidence'));
    expect(result.evidence).toContain(`commit_sha=${SHA}`);
    expect(result.evidence).toContain('runner_os=Windows');
    expect(result.evidence).toContain('step_playwright=failure');
    expect(result.evidence).toContain('ci_suite=tests/desktop/hidden-native-presentation.spec.ts');
    expect(fsApi.writeFileSync).toHaveBeenCalledWith(result.evidencePath, result.evidence, 'utf8');
    expect(fsApi.appendFileSync).toHaveBeenCalledWith('summary.md', expect.stringContaining('Windows x64 CI'), 'utf8');
  });

  it('rejects missing or unsupported step outcomes', () => {
    expect(() => writeWindowsCiEvidence({
      env: createEnv({ PLAYWRIGHT_OUTCOME: 'unknown' }),
      fsApi: { appendFileSync() {}, mkdirSync() {}, writeFileSync() {} },
      readHead: () => SHA
    })).toThrow('PLAYWRIGHT_OUTCOME has invalid outcome');
  });

  it('preserves evidence when strict context verification fails', () => {
    const writes = [];
    const result = writeWindowsCiEvidence({
      env: createEnv({ RUNNER_ARCH: 'ARM64', CONTEXT_OUTCOME: 'failure' }),
      fsApi: {
        appendFileSync() {},
        mkdirSync() {},
        writeFileSync: (_path, content) => writes.push(content)
      },
      readHead: () => SHA
    });
    expect(result.evidence).toContain('context_status=failure');
    expect(result.evidence).toContain('context_error=RUNNER_ARCH must be X64');
    expect(result.evidence).toContain('step_context=failure');
    expect(writes).toEqual([result.evidence]);
  });
});
