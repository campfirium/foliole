// @vitest-environment node

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { runCli } from './check-repository-root-boundary.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp-tests');
const tempDirs = [];

async function createFixtureRoot() {
  await mkdir(TEMP_ROOT_BASE, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'repository-root-boundary-'));
  tempDirs.push(fixtureRoot);

  const directoryNames = [
    '.claude',
    '.git',
    '.github',
    '.githooks',
    '.lab',
    '.tmp-fixture',
    'dist',
    'docs',
    'electron',
    'electron-dist',
    'android',
    'assets',
    'build',
    'ios',
    'lib',
    'logs',
    'ref',
    'release',
    'public',
    'scripts',
    'src',
    'src-tauri',
    'tests',
    'trees'
  ];

  const unauthorizedDirectoryNames = [
    'playwright-report',
    'test-results'
  ];

  await Promise.all(
    [...directoryNames, ...unauthorizedDirectoryNames].map((name) =>
      mkdir(path.join(fixtureRoot, name), { recursive: true })
    )
  );
  return fixtureRoot;
}

function createWritableBuffer() {
  const chunks = [];

  return {
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    }
  };
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-repository-root-boundary', () => {
  it('fails only for a newly added unauthorized repository root', async () => {
    const fixtureRoot = await createFixtureRoot();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stderr, stdout });
    const output = `${stdout.chunks.join('')}${stderr.chunks.join('')}`;

    expect(cliResult.exitCode).toBe(1);
    expect(output).toContain('status: VIOLATION');
    expect(output).toContain('unauthorized=playwright-report,test-results');
    expect(output).toContain('allowed=android,assets,build,docs,electron,ios,lib,public,releases,scripts,src,tests,.agents,.claude,.git,.github,.githooks,.lab');
    expect(output).not.toContain('.tmp-fixture');
    expect(output).not.toContain('ref');
    expect(output).not.toContain('src-tauri');
    expect(output).not.toContain('unauthorized=release');
    expect(output).not.toContain('trees');
  });
});
