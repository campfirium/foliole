import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const DESKTOP_HTTP_CLIENT = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionDesktopHttpClient.java'
);

describe('Android desktop sync network timeout', () => {
  it('does not allow desktop reads to leave sync spinning for minutes', async () => {
    const source = await readFile(DESKTOP_HTTP_CLIENT, 'utf8');

    expect(source).toContain('private static final int CONNECT_TIMEOUT_MS = 5000;');
    expect(source).toContain('private static final int READ_TIMEOUT_MS = 30 * 1000;');
    expect(source).not.toContain('private static final int READ_TIMEOUT_MS = 5 * 60 * 1000;');
  });
});
