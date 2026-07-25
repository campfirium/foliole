// @vitest-environment node
/* global URL */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { assertReadableDatabase } from './android-data-protection-validation.mjs';

describe('Android device data protection', () => {
  it('checks that the companion database exists before streaming its contents', async () => {
    const source = await readFile(new URL('./android-device-data-protection.mjs', import.meta.url), 'utf8');
    const existenceCheck = source.indexOf("'test', '-f', 'databases/foliole-companionSQLite.db'");
    const databaseRead = source.indexOf("'cat', 'databases/foliole-companionSQLite.db'");

    expect(existenceCheck).toBeGreaterThan(-1);
    expect(databaseRead).toBeGreaterThan(existenceCheck);
  });

  it('fails closed when a protection snapshot cannot prove a readable database', () => {
    expect(() => assertReadableDatabase({ database: { exists: false } }, 'before install')).toThrow('database is missing');
    expect(() => assertReadableDatabase({ database: { error: 'bad db', exists: true, unreadable: true } }, 'after install')).toThrow('database is unreadable');
    expect(() => assertReadableDatabase({ error: 'adb unavailable' }, 'before install')).toThrow('snapshot failed');
    expect(() => assertReadableDatabase({ database: { exists: true } }, 'after install')).not.toThrow();
  });
});
