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

describe('Windows DEV fixed device action', () => {
  it('deploys only to fixed port and serial with data protection and cleanup', async () => {
    const { evidenceRoot, paths } = fixture();
    const { calls, execute } = successfulExecutor(paths);
    await expect(runWindowsDevDeviceAction({ action: 'deploy', evidenceRoot, execute, paths }))
      .resolves.toContain('ok');
    const adbCalls = calls.filter(({ command }) => command === paths.adbPath).map(({ args }) => args);
    expect(adbCalls[0]).toEqual(['-P', WINDOWS_DEV_ADB_PORT, 'start-server']);
    expect(adbCalls).toContainEqual([
      '-P', WINDOWS_DEV_ADB_PORT, '-s', WINDOWS_DEV_A5_SERIAL, 'wait-for-device'
    ]);
    expect(adbCalls).toContainEqual([
      '-P', WINDOWS_DEV_ADB_PORT, '-s', WINDOWS_DEV_A5_SERIAL, 'get-state'
    ]);
    expect(adbCalls).toContainEqual([
      '-P', WINDOWS_DEV_ADB_PORT, '-s', WINDOWS_DEV_A5_SERIAL,
      'shell', 'am', 'force-stop', 'com.foliole.android'
    ]);
    expect(adbCalls.at(-1)).toEqual(['-P', WINDOWS_DEV_ADB_PORT, 'kill-server']);
    const protection = calls.filter(({ args }) => args.some((arg) => String(arg).includes('android-device-data-protection.mjs')));
    expect(protection).toHaveLength(2);
    expect(protection[0].args).toContain('backup');
    expect(protection[1].args).toContain('check');
    const deploy = calls.find(({ command }) => command === 'powershell.exe');
    expect(deploy.args).toContain(WINDOWS_DEV_A5_SERIAL);
    expect(deploy.args).toContain(paths.systemNode);
    expect(deploy.options.env.FOLIOLE_ANDROID_ADB_SERVER_PORT).toBe(WINDOWS_DEV_ADB_PORT);
    expect(deploy.options.env.ANDROID_USER_HOME).toBe(paths.signingHome);
    expect(calls[0].options.env).not.toHaveProperty('ANDROID_USER_HOME');
    expect(calls[0].options.env).not.toHaveProperty('ANDROID_ADB_SERVER_PORT');
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
});

it('requires the exact A5 serial to be ready', () => {
  expect(() => assertFixedDevice('other\tdevice\n')).toThrow('is absent');
  expect(() => assertFixedDevice(`${WINDOWS_DEV_A5_SERIAL}\tunauthorized\n`)).toThrow('unauthorized');
  expect(() => assertFixedDevice(`${WINDOWS_DEV_A5_SERIAL}    device product:marble\n`)).not.toThrow();
});
