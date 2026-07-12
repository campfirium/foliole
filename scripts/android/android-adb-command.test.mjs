// @vitest-environment node
/* global process */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { adbCandidates, selectReadySerial } from './android-adb-command.mjs';

describe('android-adb-command', () => {
  it('prefers explicit adb path without adding defaults', () => {
    expect(adbCandidates('C:\\Android\\platform-tools\\adb.exe')).toEqual(['C:\\Android\\platform-tools\\adb.exe']);
  });

  it('includes Windows user profile platform-tools before WSL fallback', () => {
    const previousUserProfile = process.env.USERPROFILE;
    process.env.USERPROFILE = 'C:\\Users\\zephu';
    try {
      const candidates = adbCandidates('adb');
      const windowsAdb = path.join('C:\\Users\\zephu', 'AppData/Local/Android/Sdk/platform-tools/adb.exe');
      const wslAdb = candidates.find((candidate) => candidate.startsWith('/mnt/c/Users/'));

      expect(candidates).toContain(windowsAdb);
      expect(wslAdb).toBeDefined();
      expect(candidates.indexOf(windowsAdb)).toBeLessThan(candidates.indexOf(wslAdb));
    } finally {
      process.env.USERPROFILE = previousUserProfile;
    }
  });

  it('selects the only ready device and rejects ambiguous selection', () => {
    expect(selectReadySerial('List of devices attached\nA5\tdevice\n')).toBe('A5');
    expect(() => selectReadySerial('List of devices attached\nA5\tdevice\nemulator-5554\tdevice\n'))
      .toThrow(/Multiple ready Android devices/u);
  });

  it('requires an explicitly selected device to be present and ready', () => {
    const devices = 'List of devices attached\nA5\tunauthorized\nemulator-5554\tdevice\n';
    expect(() => selectReadySerial(devices, 'A5')).toThrow(/unauthorized, not ready/u);
    expect(() => selectReadySerial(devices, 'missing')).toThrow(/was not found/u);
    expect(selectReadySerial(devices, 'emulator-5554')).toBe('emulator-5554');
  });
});
