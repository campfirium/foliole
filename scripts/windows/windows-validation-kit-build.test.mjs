// @vitest-environment node

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWindowsValidationKit,
  collectValidationSourceClosure
} from './windows-validation-kit-build.mjs';
import { verifyWindowsValidationKit } from './windows-validation-kit-verify.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function tempRoot(prefix) {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(value);
  return value;
}

function write(root, relativePath, source) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
}

describe('Windows validation kit build', () => {
  it('resolves static, dynamic, re-export, and extensionless TypeScript imports', () => {
    const root = tempRoot('foliole-validation-closure-');
    write(root, 'entry.ts', "import './helper'; export * from './more.mjs'; await import('playwright');\n");
    write(root, 'helper.ts', "import type { Page } from '@playwright/test'; export const value = 1;\n");
    write(root, 'more.mjs', 'export const more = true;\n');
    expect(collectValidationSourceClosure(root, ['entry.ts'])).toEqual(['entry.ts', 'helper.ts', 'more.mjs']);
    write(root, 'bad.ts', "import value from 'unknown-package';\n");
    expect(() => collectValidationSourceClosure(root, ['bad.ts'])).toThrow('unsupported validation-kit bare import');
  });

  it('builds a hashed minimal kit and rejects identity, Node, or file tampering', () => {
    const artifactRoot = tempRoot('foliole-validation-artifact-');
    const installerName = 'Foliole-Setup-test-win-x64.exe';
    const installer = Buffer.from('installer');
    const installerHash = createHash('sha256').update(installer).digest('hex');
    fs.writeFileSync(path.join(artifactRoot, installerName), installer);
    fs.writeFileSync(path.join(artifactRoot, 'SHA256SUMS.txt'), `${installerHash} *${installerName}\n`);
    const commitSha = 'a'.repeat(40);
    const { kitRoot, manifest } = buildWindowsValidationKit({
      env: { GITHUB_RUN_ATTEMPT: '2', GITHUB_RUN_ID: '1234' },
      head: () => commitSha,
      outputRoot: artifactRoot,
      repoRoot: process.cwd()
    });
    const expected = { commitSha, runAttempt: '2', runId: '1234' };
    expect(manifest.files.some((entry) => entry.path === 'manifest.json')).toBe(false);
    expect(manifest.runtimePackages).toEqual({
      '@playwright/test': '1.61.1',
      playwright: '1.61.1',
      'playwright-core': '1.61.1'
    });
    const playwright = spawnSync(process.execPath, [path.join(kitRoot, 'node_modules/playwright/cli.js'), '--version'], {
      cwd: kitRoot,
      encoding: 'utf8'
    });
    expect(playwright.status).toBe(0);
    expect(playwright.stdout).toContain('Version 1.61.1');
    expect(() => verifyWindowsValidationKit({ expected: { ...expected, runId: 'wrong' }, kitRoot })).toThrow('runId');
    expect(() => verifyWindowsValidationKit({ expected, kitRoot, nodeVersion: '21.0.0' })).toThrow('Node 22');
    const packageJson = path.join(kitRoot, 'package.json');
    fs.appendFileSync(packageJson, 'tamper');
    expect(() => verifyWindowsValidationKit({ expected, kitRoot })).toThrow('hash mismatch');
  });
});
