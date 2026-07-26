// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertAndroidAuditHost,
  parseArgs,
  runAudit
} from './android-sync-audit.mjs';

describe('Android sync audit host boundary', () => {
  it('requires an explicit local Android database copy on Darwin', () => {
    const options = parseArgs([]);

    expect(() => assertAndroidAuditHost(options, 'darwin')).toThrow('Pass --android-db');
    expect(() => assertAndroidAuditHost(
      { ...options, androidDb: '/local/android.db' },
      'darwin'
    )).not.toThrow();
  });

  it('rejects Darwin before desktop database or adb resolution', async () => {
    await expect(runAudit({
      adb: '/missing/adb',
      androidDb: '',
      desktopDb: '/missing/desktop.db',
      keep: false,
      platform: 'darwin'
    })).rejects.toThrow('scripts/windows/windows-android-lab-control.mjs');
  });

  it('preserves device-backed audits on Windows', () => {
    expect(() => assertAndroidAuditHost({ androidDb: '' }, 'win32')).not.toThrow();
  });
});
