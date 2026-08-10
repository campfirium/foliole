// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertFixedDevice, runWindowsDevDeviceAction, WINDOWS_DEV_A5_SERIAL, WINDOWS_DEV_ADB_PORT
} from './windows-dev-device-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-device-'));
  roots.push(root);
  return {
    evidenceRoot: path.join(root, 'evidence'),
    paths: {
      adbPath: path.join(root, 'adb.exe'), androidSdk: path.join(root, 'sdk'),
      javaHome: path.join(root, 'java'), protectionBackups: path.join(root, 'protection'),
      repoRoot: path.join(root, 'repo'), signingHome: path.join(root, 'signing'),
      systemNode: path.join(root, 'node.exe')
    }
  };
}

function result(stdout = '') {
  return { code: 0, lines: stdout.trim() ? [stdout.trim()] : [], output: stdout, stderr: '', stdout };
}

function successfulExecutor(paths, overrides = {}) {
  const calls = [];
  const execute = vi.fn(async (command, args, options) => {
    calls.push({ args, command, options });
    if (args.includes('devices')) return result(overrides.devices
      ?? `${WINDOWS_DEV_A5_SERIAL}\tdevice product:A5\n`);
    if (args.includes('get-state')) return result('device\n');
    return result('ok\n');
  });
  return { calls, execute };
}

function successfulLiveReload() {
  return vi.fn(async ({ buildIdentity }) => ({
    liveReload: { buildIdentity, deviceLoads: 2, screenshotPath: 'a5-live.png' },
    output: 'live ok\n'
  }));
}

describe('Windows DEV fixed device action', () => {
  it('deploys only to the fixed port and serial without retaining a device backup', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    await expect(runWindowsDevDeviceAction({
      action: 'deploy', buildIdentity: 'dev-1', evidenceRoot, execute, paths,
      runLiveReload: successfulLiveReload()
    })).resolves.toMatchObject({ output: expect.stringContaining('ok') });
    const adbCalls = calls.filter(({ command }) => command === paths.adbPath).map(({ args }) => args);
    expect(adbCalls[0]).toEqual(['-P', WINDOWS_DEV_ADB_PORT, 'start-server']);
    expect(adbCalls).toContainEqual([
      '-P', WINDOWS_DEV_ADB_PORT, '-s', WINDOWS_DEV_A5_SERIAL, 'wait-for-device'
    ]);
    expect(adbCalls).toContainEqual([
      '-P', WINDOWS_DEV_ADB_PORT, '-s', WINDOWS_DEV_A5_SERIAL, 'get-state'
    ]);
    expect(adbCalls.at(-1)).toEqual(['-P', WINDOWS_DEV_ADB_PORT, 'kill-server']);
    const protection = calls.filter(({ args }) => args.some((arg) => String(arg).includes('android-device-data-protection.mjs')));
    expect(protection).toHaveLength(0);
    const deploy = calls.find(({ command }) => command === 'powershell.exe');
    expect(deploy.args).toContain(WINDOWS_DEV_A5_SERIAL);
    expect(deploy.args).toContain(paths.systemNode);
    expect(deploy.options.env.FOLIOLE_ANDROID_ADB_SERVER_PORT).toBe(WINDOWS_DEV_ADB_PORT);
    expect(deploy.options.env.ANDROID_USER_HOME).toBe(paths.signingHome);
    expect(calls[0].options.env).not.toHaveProperty('ANDROID_USER_HOME');
    expect(calls[0].options.env).not.toHaveProperty('ANDROID_ADB_SERVER_PORT');
    expect(calls.flatMap(({ args }) => args)).not.toContain('installDebug');
  });

  it('maps an offline fixed device to 69 and still stops the action-owned server', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths, {
      devices: `${WINDOWS_DEV_A5_SERIAL}\toffline\n`
    });
    await expect(runWindowsDevDeviceAction({ action: 'verify', evidenceRoot, execute, paths }))
      .rejects.toMatchObject({ exitCode: 69, stage: 'device' });
    expect(calls.at(-1).args).toEqual(['-P', WINDOWS_DEV_ADB_PORT, 'kill-server']);
  });

  it('runs verify through the fixed Node launch check', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    await runWindowsDevDeviceAction({ action: 'verify', evidenceRoot, execute, paths });
    const verify = calls.find(({ args }) => args.some((arg) => String(arg).includes('verify-android-launch.mjs')));
    expect(verify.args).toContain(WINDOWS_DEV_A5_SERIAL);
    expect(verify.args).toContain(WINDOWS_DEV_ADB_PORT);
  });

  it('routes capture annotation through the fixed serial, protection helper, and bounded action', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    const runCaptureAnnotation = vi.fn(async ({ protectData }) => {
      await protectData('backup', path.join(evidenceRoot, 'protection.json'), path.join(evidenceRoot, 'backup'));
      return {
        captureAnnotation: { buildIdentity: 'capture-1', manifestPath: 'manifest.json' },
        output: 'accepted\n'
      };
    });
    const result = await runWindowsDevDeviceAction({
      action: 'capture-annotation', buildIdentity: 'capture-1', evidenceRoot, execute, paths,
      runCaptureAnnotation, runLiveReload: vi.fn()
    });
    expect(result.captureAnnotation).toMatchObject({ buildIdentity: 'capture-1' });
    expect(runCaptureAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      adbPort: WINDOWS_DEV_ADB_PORT, serial: WINDOWS_DEV_A5_SERIAL
    }));
    const protection = calls.find(({ args }) =>
      args.some((arg) => String(arg).includes('android-device-data-protection.mjs')));
    expect(protection.args).toContain(path.join(evidenceRoot, 'backup'));
    expect(calls.at(-1).args).toEqual(['-P', WINDOWS_DEV_ADB_PORT, 'kill-server']);
  });

  it('returns approval_required from the read-only gate without force-stop, backup, or install', async () => {
    const { evidenceRoot, paths } = fixture();
    const readiness = {
      canonicalInbox: { active: false, kind: null },
      counts: { content_blobs: 0, node_order: 0, nodes: 0 },
      missingPrerequisites: ['acceptance_workspace_empty', 'canonical_inbox_missing'],
      pairingWorkspace: { localDeviceIdentityPresent: false, syncEndpointPresent: false },
      resultStatus: 'approval_required', schemaVersion: 1
    };
    const { calls, execute: baseExecute } = successfulExecutor(paths);
    const execute = vi.fn(async (command, args, options) => {
      if (args.some((arg) => String(arg).includes('android-capture-annotation-readiness-runner.mjs'))) {
        calls.push({ args, command, options });
        return { ...result(`[android-data] capture-annotation-readiness=${JSON.stringify(readiness)}`), code: 77 };
      }
      return baseExecute(command, args, options);
    });
    await expect(runWindowsDevDeviceAction({
      action: 'capture-annotation', buildIdentity: 'capture-empty', evidenceRoot, execute,
      paths, phase: 'readiness'
    })).rejects.toMatchObject({
      exitCode: 77, readiness: { resultStatus: 'approval_required' },
      resultStatus: 'approval_required', stage: 'capture-readiness'
    });
    const allArgs = calls.flatMap(({ args }) => args).join(' ');
    expect(allArgs).not.toMatch(/force-stop| backup | install |instrument/iu);
    expect(calls.filter(({ args }) => args.some(
      (arg) => String(arg).includes('android-capture-annotation-readiness-runner.mjs')
    ))).toHaveLength(1);
    expect(calls.at(-1).args).toEqual(['-P', WINDOWS_DEV_ADB_PORT, 'kill-server']);
  });

  it('routes renderer-only live action without PowerShell deploy or APK install', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    await runWindowsDevDeviceAction({
      action: 'live', buildIdentity: 'dev-2', evidenceRoot, execute, paths,
      runLiveReload: successfulLiveReload()
    });
    expect(calls.some(({ command }) => command === 'powershell.exe')).toBe(false);
    expect(calls.flatMap(({ args }) => args).join(' ')).not.toMatch(/install|gradle/iu);
  });

  it('routes fixed Appearance acceptance through the renderer-only live surface', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    const runLiveReload = successfulLiveReload();
    await runWindowsDevDeviceAction({
      action: 'appearance', buildIdentity: 'dev-appearance', evidenceRoot, execute, paths,
      runLiveReload
    });
    expect(runLiveReload).toHaveBeenCalledWith(expect.objectContaining({ surface: 'appearance' }));
    expect(calls.some(({ command }) => command === 'powershell.exe')).toBe(false);
    expect(calls.flatMap(({ args }) => args).join(' ')).not.toMatch(/install|gradle/iu);
  });

  it('routes secondary-surface acceptance through the bounded live surface', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    const runLiveReload = successfulLiveReload();
    await runWindowsDevDeviceAction({
      action: 'secondary', buildIdentity: 'dev-secondary', evidenceRoot, execute, paths,
      runLiveReload
    });
    expect(runLiveReload).toHaveBeenCalledWith(expect.objectContaining({ surface: 'secondary' }));
    expect(calls.some(({ command }) => command === 'powershell.exe')).toBe(false);
    expect(calls.flatMap(({ args }) => args).join(' ')).not.toMatch(/install|gradle/iu);
  });
});

it('requires the exact A5 serial to be ready', () => {
  expect(() => assertFixedDevice('other\tdevice\n')).toThrow('is absent');
  expect(() => assertFixedDevice(`${WINDOWS_DEV_A5_SERIAL}\tunauthorized\n`)).toThrow('unauthorized');
  expect(() => assertFixedDevice(`${WINDOWS_DEV_A5_SERIAL}    device product:marble\n`)).not.toThrow();
});
