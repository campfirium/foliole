// @vitest-environment node
/* global process */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { adbCandidates } from './android-adb-command.mjs';

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
});
