import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { assertBuiltRendererMode } from './package-built-artifacts.mjs';

it('rejects reusing an internal renderer in a public package', () => {
  const parent = '.tmp/artifacts/T752';
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'renderer-mode-'));
  try {
    mkdirSync(join(root, 'dist/desktop'), { recursive: true });
    writeFileSync(join(root, 'dist/desktop/index.html'), '<meta name="foliole-build-mode" content="internal">');
    expect(() => assertBuiltRendererMode(true, root)).not.toThrow();
    expect(() => assertBuiltRendererMode(false, root)).toThrow('not built in production mode');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
