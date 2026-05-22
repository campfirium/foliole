// @vitest-environment node
/* global process */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRE_COMMIT_VALIDATION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pre-commit-validation.mjs');

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'pre-commit-native-sqlite-'));
  await runCommand('git', ['init'], repoDir);
  await runCommand('git', ['config', 'user.name', 'Precommit Test'], repoDir);
  await runCommand('git', ['config', 'user.email', 'precommit@example.com'], repoDir);
  await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
  await writeFile(path.join(repoDir, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
  await writeFile(path.join(repoDir, 'scripts', 'check-file-budget.mjs'), 'process.exit(0);\n', 'utf8');
  await writeFile(path.join(repoDir, 'scripts', 'lint-changed.sh'), '#!/usr/bin/env bash\nexit 0\n', {
    encoding: 'utf8',
    mode: 0o755
  });
  await writeFile(path.join(repoDir, 'scripts', 'quality-critical-test-routes.mjs'), '\n', 'utf8');
  return repoDir;
}

describe('pre-commit native sqlite validation', () => {
  it('blocks new ordinary Node sqlite entrypoints from being staged', async () => {
    const repoDir = await createRepo();
    try {
      await writeFile(
        path.join(repoDir, 'package.json'),
        JSON.stringify({
          scripts: {
            'android:sync:audit': 'node scripts/android/android-sync-audit.mjs',
            'oneoff:sqlite:node-kind-report': 'node --experimental-strip-types scripts/node-kind-report.ts'
          }
        }),
        'utf8'
      );
      await writeFile(
        path.join(repoDir, 'scripts', 'new-sqlite-entry.mjs'),
        'import Database from "better-sqlite3";\nnew Database(":memory:").close();\n',
        'utf8'
      );
      await runCommand('git', ['add', 'package.json', 'scripts/new-sqlite-entry.mjs'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('native sqlite ABI policy violation');
      expect(result.stderr).toContain('controlled Electron ABI runner');
      expect(result.stderr).toContain('do not add new ordinary Node scripts');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('blocks ordinary Node test scripts that target real sqlite tests', async () => {
    const repoDir = await createRepo();
    try {
      await mkdir(path.join(repoDir, 'electron', 'database'), { recursive: true });
      await writeFile(
        path.join(repoDir, 'package.json'),
        JSON.stringify({
          scripts: {
            'test:readwise:visibility': 'npm run test:files -- electron/database/externalDocumentImportVisibility.test.ts'
          }
        }),
        'utf8'
      );
      await writeFile(
        path.join(repoDir, 'electron', 'database', 'externalDocumentImportVisibility.test.ts'),
        "import { openDatabaseConnection } from './connection.js';\nopenDatabaseConnection();\n",
        'utf8'
      );
      await runCommand('git', ['add', 'package.json', 'electron/database/externalDocumentImportVisibility.test.ts'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('native sqlite ABI policy violation');
      expect(result.stderr).toContain('route real sqlite tests through npm run test:sqlite:electron');
      expect(result.stderr).toContain('electron/database/externalDocumentImportVisibility.test.ts');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('ignores guard source and test fixtures that quote blocked sqlite examples', async () => {
    const repoDir = await createRepo();
    try {
      await writeFile(
        path.join(repoDir, 'scripts', 'pre-commit-validation.mjs'),
        'const example = "npm rebuild better-sqlite3";\n',
        'utf8'
      );
      await writeFile(
        path.join(repoDir, 'scripts', 'native-sqlite-policy.test.mjs'),
        'const fixture = "import Database from \\"better-sqlite3\\"; node scripts/sqlite-maintenance.ts";\n',
        'utf8'
      );
      await runCommand('git', ['add', 'scripts/pre-commit-validation.mjs', 'scripts/native-sqlite-policy.test.mjs'], repoDir);

      const result = await runCommand('node', [PRE_COMMIT_VALIDATION_SCRIPT], repoDir);

      expect(result.code, result.stderr).toBe(0);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
