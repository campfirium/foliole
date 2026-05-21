// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

it('passes native GPU disable switches before the Electron app path', async () => {
  const runner = await readFile(path.resolve(process.cwd(), 'scripts/electron-dev.mjs'), 'utf8');

  expect(runner).toContain("args.push('--disable-gpu', '--disable-gpu-compositing', '--disable-gpu-sandbox');");
  expect(runner).toContain("args.push(entryPath);");
  expect(runner).toContain("run('npx', createElectronArgs('electron-dist/electron/main.js')");
});
