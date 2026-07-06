// @vitest-environment node
/* global process */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  controlledElectronSqliteTests,
  ordinaryNodeSqliteTextOnlyTests
} from './native-sqlite-test-policy.mjs';

const SQLITE_PATTERN = /\b(?:import\b[\s\S]*?\bfrom\s+|require\s*\()\s*['"]better-sqlite3['"]/u;
const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

async function testFiles() {
  return collectTestFiles(['electron', 'src', 'scripts']);
}

async function collectTestFiles(roots) {
  const files = [];
  for (const root of roots) {
    files.push(...await collectTestFilesFromDir(root));
  }
  return files.sort();
}

async function collectTestFilesFromDir(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTestFilesFromDir(entryPath));
    } else if (/\.test\./u.test(entry.name)) {
      files.push(entryPath.replaceAll('\\', '/'));
    }
  }
  return files;
}

describe('native sqlite test policy', () => {
  it('keeps direct better-sqlite3 tests declared in the native sqlite policy', async () => {
    const files = await testFiles();
    const sqliteTests = [];
    for (const file of files) {
      const source = await readFile(path.resolve(process.cwd(), file), 'utf8');
      if (SQLITE_PATTERN.test(source)) sqliteTests.push(file.replaceAll('\\', '/'));
    }

    const declared = new Set([...controlledElectronSqliteTests, ...ordinaryNodeSqliteTextOnlyTests]);
    expect(sqliteTests.filter((file) => !declared.has(file)).sort()).toEqual([]);

    const manifest = JSON.parse(await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(manifest.scripts['test:sqlite:electron']).toBe('node scripts/electron-sqlite-runner.mjs scripts/test-files.mjs');
  }, RELEASE_GATE_TEST_TIMEOUT_MS);

  it('keeps Readwise sqlite visibility coverage on the Electron ABI test entry', () => {
    expect(controlledElectronSqliteTests).toContain('electron/database/externalDocumentImportVisibility.test.ts');
  });

  it('keeps schema inventory coverage on the Electron ABI test entry', () => {
    expect(controlledElectronSqliteTests).toContain('scripts/android/schema-inventory.test.mjs');
  });
});
