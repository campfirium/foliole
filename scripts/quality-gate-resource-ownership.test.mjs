// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readPackageScripts() {
  const packageJson = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  return packageJson.scripts;
}

describe('quality gate resource ownership', () => {
  it('routes heavy build scripts through the node-heavy gate', async () => {
    const scripts = await readPackageScripts();
    const testFilesScript = await readFile(path.join(REPO_ROOT, 'scripts', 'test-files.mjs'), 'utf8');

    expect(scripts.build).toContain('with-resource-gate.mjs node-heavy');
    expect(scripts['electron:compile']).toContain('with-resource-gate.mjs node-heavy');
    expect(scripts['android:web:build']).toContain('with-resource-gate.mjs node-heavy');
    expect(scripts['lint:files']).toContain('with-resource-gate.mjs node-heavy');
    expect(testFilesScript).toContain('withResourceGate');
    expect(testFilesScript).toContain("className: 'node-heavy'");
    expect(scripts['test:e2e:desktop']).toContain('with-resource-gate.mjs preview');
  });

  it('keeps fast changed-file lint under the node-heavy gate', async () => {
    const script = await readFile(path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh'), 'utf8');

    expect(script).toContain('with-resource-gate.mjs node-heavy -- node node_modules/eslint/bin/eslint.js');
  });
});
