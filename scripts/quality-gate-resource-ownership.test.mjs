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
  it('keeps default package scripts outside the resource gate', async () => {
    const scripts = await readPackageScripts();
    const testFilesScript = await readFile(path.join(REPO_ROOT, 'scripts', 'test-files.mjs'), 'utf8');

    expect(scripts.build).not.toContain('with-resource-gate.mjs');
    expect(scripts['electron:compile']).not.toContain('with-resource-gate.mjs');
    expect(scripts['android:web:build']).not.toContain('with-resource-gate.mjs');
    expect(scripts['lint:files']).not.toContain('with-resource-gate.mjs');
    expect(testFilesScript).not.toContain('withResourceGate');
    expect(scripts['test:e2e:desktop']).not.toContain('with-resource-gate.mjs');
  });

  it('runs fast changed-file lint without the resource gate', async () => {
    const script = await readFile(path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh'), 'utf8');

    expect(script).toContain('node node_modules/eslint/bin/eslint.js --cache --cache-location .tmp/eslint-cache/changed/');
    expect(script).not.toContain('with-resource-gate.mjs node-heavy -- node node_modules/eslint/bin/eslint.js');
  });

  it('serializes agent desktop Playwright through the preview resource gate', async () => {
    const scripts = await readPackageScripts();

    expect(scripts['test:e2e:desktop:agent']).toContain('scripts/with-resource-gate.mjs preview --');
  });
});
