// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

it('keeps the proven Electron dev runner while scoping native user data', async () => {
  const runner = await readFile(path.resolve(process.cwd(), 'scripts/windows/electron-dev-native.mjs'), 'utf8');
  const main = await readFile(path.resolve(process.cwd(), 'electron/main.ts'), 'utf8');

  expect(runner).toContain("process.env.FOLIOLE_USER_DATA_PATH ??= userDataPath");
  expect(runner).toContain("process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`");
  expect(runner).toContain("await import('../electron-dev.mjs');");
  expect(main).not.toContain('FOLIOLE_DISABLE_HARDWARE_ACCELERATION');
});
