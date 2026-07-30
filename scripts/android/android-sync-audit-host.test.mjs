// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertAndroidAuditHost,
  parseArgs,
  runAudit
} from './android-sync-audit.mjs';

describe('Android sync audit host boundary', () => {
  it('requires an explicit local Android database copy on every host', () => {
    const options = parseArgs([]);

    expect(() => assertAndroidAuditHost(options)).toThrow('Pass --android-db');
    expect(() => assertAndroidAuditHost({ ...options, androidDb: '/local/android.db' })).not.toThrow();
  });

  it('rejects missing local input before desktop database resolution', async () => {
    await expect(runAudit({
      androidDb: '',
      desktopDb: '/missing/desktop.db',
      keep: false
    })).rejects.toThrow('Pass --android-db');
  });
});
