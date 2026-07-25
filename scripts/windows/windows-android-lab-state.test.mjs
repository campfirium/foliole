// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  androidLabPaths, assertExclusiveDevice, parseAndroidLabCommand, readJson, safeLabEvidencePath, WINDOWS_ANDROID_LAB_TASK
} from './windows-android-lab-state.mjs';

const SHA = 'a'.repeat(40);

describe('Windows Android lab state contract', () => {
  it('keeps the task and state root separate from release acceptance', () => {
    const paths = androidLabPaths('C:\\state\\windows-android-lab');
    expect(WINDOWS_ANDROID_LAB_TASK).toBe('FolioleAndroidLab');
    expect(paths.root).not.toContain('windows-device');
    expect(paths.device).toContain('device.json');
    expect(paths.preview).toBe('C:\\dev\\foliole-android-lab-preview');
    expect(paths.signingKeystore).toContain('debug.keystore');
  });

  it('accepts only the fixed command and evidence grammar', () => {
    expect(parseAndroidLabCommand(`run ${SHA}`)).toEqual({ action: 'run', commitSha: SHA });
    expect(parseAndroidLabCommand('collect get summary.json').relativePath).toBe('summary.json');
    expect(parseAndroidLabCommand('collect get logcat.txt').relativePath).toBe('logcat.txt');
    expect(parseAndroidLabCommand('device status')).toEqual({ action: 'device', operation: 'status' });
    expect(parseAndroidLabCommand(`signing install 2618 ${'1'.repeat(64)}`)).toEqual({
      action: 'signing', byteLength: 2618, operation: 'install', sha256: '1'.repeat(64)
    });
    expect(parseAndroidLabCommand('device reconnect 192.168.0.107:38717')).toMatchObject({
      endpoint: '192.168.0.107:38717', operation: 'reconnect'
    });
    expect(() => parseAndroidLabCommand('run HEAD')).toThrow();
    expect(() => parseAndroidLabCommand('collect get ../git-read-token.txt')).toThrow();
    expect(() => parseAndroidLabCommand('deploy 1 abc')).toThrow();
    expect(() => parseAndroidLabCommand('device reconnect 999.1.1.1:70000')).toThrow();
    expect(() => parseAndroidLabCommand(`signing install 65537 ${'1'.repeat(64)}`)).toThrow();
    expect(() => parseAndroidLabCommand('signing install C:\\Users\\me\\debug.keystore')).toThrow();
    expect(safeLabEvidencePath('/evidence', 'runner.log')).toContain('runner.log');
  });

  it('requires exactly one ready device and the configured serial', () => {
    expect(() => assertExclusiveDevice('List of devices attached\nA5\tdevice\n', 'A5')).not.toThrow();
    expect(() => assertExclusiveDevice('A5\tdevice\nB6\tdevice\n', 'A5')).toThrow('exactly one');
    expect(() => assertExclusiveDevice('A5\tunauthorized\n', 'A5')).toThrow('found none');
  });

  it('reads UTF-8 JSON written with a Windows PowerShell BOM', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-bom-'));
    const file = path.join(root, 'config.json');
    try {
      fs.writeFileSync(file, `\uFEFF${JSON.stringify({ schemaVersion: 2 })}`, 'utf8');
      expect(readJson(file)).toEqual({ schemaVersion: 2 });
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
