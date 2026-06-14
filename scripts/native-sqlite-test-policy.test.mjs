// @vitest-environment node
/* global process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  controlledElectronSqliteTests,
  ordinaryNodeSqliteTextOnlyTests
} from './native-sqlite-test-policy.mjs';

const SQLITE_PATTERN = /\b(?:import\b[\s\S]*?\bfrom\s+|require\s*\()\s*['"]better-sqlite3['"]/u;
const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

async function testFiles() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('rg', ['--files', '-g', '*.test.*', 'electron', 'src', 'scripts'], {
    encoding: 'utf8'
  });
  return stdout.split(/\r?\n/u).filter(Boolean);
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
});
