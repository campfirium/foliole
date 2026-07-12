// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runWindowsValidationKit } from './windows-validation-kit-runner.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function root() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-validation-runner-'));
  roots.push(value);
  return value;
}

function verifier() {
  return {
    installerPath: 'C:\\artifact\\Foliole.exe',
    manifest: {
      appVersion: '0.6.5',
      commitSha: 'a'.repeat(40),
      runAttempt: '2',
      runId: '1234'
    }
  };
}

describe('Windows validation kit runner', () => {
  it('runs fixed install, readiness, and physical steps before promoting success', async () => {
    const cacheRoot = root();
    const verifyKit = vi.fn(verifier);
    const runPhysicalPlaywright = vi.fn(async () => ({ code: 0, lines: ['passed'] }));
    const smokeInstalledApp = vi.fn(async () => undefined);
    const outcome = await runWindowsValidationKit({
      cacheRoot,
      executeCommand: vi.fn(async () => ({ code: 0, lines: ['installed'] })),
      expected: { commitSha: 'a'.repeat(40), runAttempt: '2', runId: '1234' },
      platform: 'win32',
      runPhysicalPlaywright,
      smokeInstalledApp,
      verifyKit
    });
    expect(verifyKit).toHaveBeenCalledWith(expect.objectContaining({ expected: expect.objectContaining({ runId: '1234' }) }));
    expect(outcome.result.steps).toEqual([
      { name: 'install', status: 'success' },
      { name: 'readiness', status: 'success' },
      { name: 'physical_playwright', status: 'success' }
    ]);
    expect(outcome.directory).toBe(path.join(cacheRoot, 'last-passed'));
    const environments = [
      smokeInstalledApp.mock.calls[0]?.[0]?.env,
      runPhysicalPlaywright.mock.calls[0]?.[1]
    ];
    for (const env of environments) {
      expect(env).toMatchObject({
        FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
        FOLIOLE_ELECTRON_NATIVE_VISIBLE: '1'
      });
      expect(env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).toBeUndefined();
    }
  });

  it('archives a readiness failure with later steps explicitly skipped', async () => {
    const cacheRoot = root();
    const smokeError = Object.assign(new Error('bridge unavailable'), { code: 'readiness_failed' });
    const outcome = await runWindowsValidationKit({
      cacheRoot,
      executeCommand: async () => ({ code: 0, lines: [] }),
      expected: { commitSha: 'a'.repeat(40), runAttempt: '2', runId: '1234' },
      platform: 'win32',
      runPhysicalPlaywright: vi.fn(),
      smokeInstalledApp: vi.fn(async () => { throw smokeError; }),
      verifyKit: verifier
    });
    expect(outcome.result.errorCode).toBe('readiness_failed');
    expect(outcome.result.steps).toEqual([
      { name: 'install', status: 'success' },
      { name: 'readiness', status: 'failure' },
      { name: 'physical_playwright', status: 'skipped' }
    ]);
  });
});
