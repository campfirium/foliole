// @vitest-environment node
/* global URL */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('Android device data protection', () => {
  it('checks that the companion database exists before streaming its contents', async () => {
    const source = await readFile(new URL('./android-device-data-protection.mjs', import.meta.url), 'utf8');
    const existenceCheck = source.indexOf("'test', '-f', 'databases/foliole-companion.db'");
    const databaseRead = source.indexOf("'cat', 'databases/foliole-companion.db'");

    expect(existenceCheck).toBeGreaterThan(-1);
    expect(databaseRead).toBeGreaterThan(existenceCheck);
  });
});
