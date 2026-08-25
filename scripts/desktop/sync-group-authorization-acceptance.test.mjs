// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

it('runs safeStorage acceptance through the isolated signed Hidden Native runtime', () => {
  const source = fs.readFileSync(path.resolve(
    'scripts/desktop/sync-group-authorization-acceptance.mjs'
  ), 'utf8');

  expect(source).toContain('prepareMacosHiddenElectronRuntime');
  expect(source).toContain('macos-hidden-electron-credential-bootstrap.mjs');
  expect(source).toContain("delete env.ELECTRON_RUN_AS_NODE");
  expect(source).toContain('node_modules/typescript/lib/tsc.js');
  expect(source).not.toContain('esbuild');
  expect(source).not.toContain('resolveElectronBinary');
});
