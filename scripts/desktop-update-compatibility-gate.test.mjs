// @vitest-environment node

import { describe, expect, it } from 'vitest';

import fs from 'node:fs';

import {
  resolveCompatibilityGateArgs,
  runCompatibilityGateCli
} from './desktop-update-compatibility-gate.mjs';

describe('desktop update compatibility gate', () => {
  it('delegates networking to a real Electron updater runtime', () => {
    const source = fs.readFileSync('scripts/desktop-update-compatibility-gate.mjs', 'utf8');
    const probe = fs.readFileSync('scripts/desktop-update-electron-runtime-probe.cjs', 'utf8');
    expect(source).toContain('ElectronHttpExecutor');
    expect(probe).toContain('new updaterModule.MacUpdater()');
    expect(probe).toContain('new updaterModule.NsisUpdater()');
    expect(source).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(`${source}\n${probe}`).not.toContain('NodeHttpExecutor');
  });

  it('owns the final process status after a verified gate result', async () => {
    const runtime = { exitCode: 1 };
    await runCompatibilityGateCli(async () => {}, runtime);
    expect(runtime.exitCode).toBe(0);
  });

  it('keeps gate failures terminal', async () => {
    const runtime = { exitCode: 0 };
    const messages = [];
    await runCompatibilityGateCli(async () => {
      throw new Error('signature mismatch');
    }, runtime, { error: (message) => messages.push(message) });
    expect(runtime.exitCode).toBe(1);
    expect(messages).toEqual(['[desktop-update-compatibility] signature mismatch']);
  });

  it('requires an explicit previous version and same-run artifact directory', () => {
    expect(resolveCompatibilityGateArgs([
      '--current-version=0.8.0',
      '--target-version=0.8.1',
      '--directory=artifacts/windows'
    ], 'win32')).toMatchObject({ currentVersion: '0.8.0', platform: 'win32', targetVersion: '0.8.1' });
  });

  it('refuses unsupported hosts instead of simulating their updater', () => {
    expect(() => resolveCompatibilityGateArgs([
      '--current-version=0.8.0', '--target-version=0.8.1', '--directory=artifacts'
    ], 'linux')).toThrow('does not support linux');
  });
});
