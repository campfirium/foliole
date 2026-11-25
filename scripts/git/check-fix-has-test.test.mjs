// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { cleanMessage, evaluateCommit, isBugFixMessage, isTestPath } from './check-fix-has-test.mjs';

const SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-fix-has-test.mjs');
const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('bug-fix classification', () => {
  it('treats a fix subject verb or a cited Discussion/issue as a bug fix', () => {
    expect(isBugFixMessage('008788 fix mobile backlink source navigation')).toBe(true);
    expect(isBugFixMessage('008835 lock the reading body\n\ncontext: the body jumped (Discussion #313).')).toBe(true);
    expect(isBugFixMessage('008800 tune masks\n\ncontext: Issue #265 showed see-through masks.')).toBe(true);
  });

  it('ignores feature work, fixtures, dependency PR numbers and reverts', () => {
    expect(isBugFixMessage('008807 preserve typed formula cloze snapshot fixtures')).toBe(false);
    expect(isBugFixMessage('008700 update react-pdf\n\ncontext: Renovate proposed react-pdf 11.1.0 (#304).')).toBe(false);
    expect(isBugFixMessage('Revert "008788 fix mobile backlink source navigation"')).toBe(false);
  });

  it('recognizes test files across desktop, Android and iOS layouts', () => {
    ['src/a.test.tsx', 'scripts/x.test.mjs', 'tests/desktop/a.spec.ts', 'electron/db/n.test.helpers.ts',
      'android/app/src/test/java/com/foliole/android/FooTest.java',
      'android/app/src/androidTest/java/com/foliole/android/Bar.java',
      'ios/App/SyncPackValidatorTests/Pack.swift'].forEach((file) => expect(isTestPath(file), file).toBe(true));
    ['src/app/latest.ts', 'docs/i18n/guides/en/a.md', 'src/contest.ts'].forEach((file) => expect(isTestPath(file), file).toBe(false));
  });
});

describe('evaluateCommit', () => {
  const fix = '008900 fix tree row count column width\n\ncontext: a.\nchange: b.\nintent: c.';

  it('passes a fix that changes a test, and a fix with a no-test reason', () => {
    expect(evaluateCommit({ message: fix, files: ['src/Row.tsx', 'src/Row.test.tsx'] }).status).toBe('has-test');
    expect(evaluateCommit({ message: `${fix}\nno-test: native-only status bar, covered by smoke F10`, files: ['src/Row.tsx'] }))
      .toEqual({ status: 'no-test', reason: 'native-only status bar, covered by smoke F10' });
  });

  it('blocks a fix without a test or with an empty no-test reason', () => {
    expect(evaluateCommit({ message: fix, files: ['src/Row.tsx'] }).status).toBe('missing');
    expect(evaluateCommit({ message: `${fix}\nno-test:`, files: ['src/Row.tsx'] }).status).toBe('missing');
  });

  it('drops git comment lines and the verbose diff before classifying', () => {
    const raw = '008901 tune layout\n\ncontext: a.\n# Discussion #313 in a comment\n# ------------------------ >8 ------------------------\nfix Discussion #1';
    expect(isBugFixMessage(cleanMessage(raw))).toBe(false);
  });
});

function git(repoDir, ...args) {
  const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function runHook(repoDir, message) {
  const messagePath = path.join(repoDir, '.git', 'COMMIT_EDITMSG');
  return writeFile(messagePath, message, 'utf8')
    .then(() => spawnSync('node', [SCRIPT_PATH, 'commit-msg', messagePath], { cwd: repoDir, encoding: 'utf8' }));
}

it('checks staged files in the commit-msg hook, including an amend of a fix commit', async () => {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-fix-test-'));
  tempDirs.push(repoDir);
  git(repoDir, 'init');
  git(repoDir, 'config', 'user.name', 'Fix Test');
  git(repoDir, 'config', 'user.email', 'fix@example.com');
  await writeFile(path.join(repoDir, 'row.ts'), 'export const a = 1;\n');
  git(repoDir, 'add', 'row.ts');

  const blocked = await runHook(repoDir, '000001 fix row width\n\ncontext: a.\n');
  expect(blocked.status).toBe(1);
  expect(blocked.stderr).toContain('no-test: <reason>');

  await writeFile(path.join(repoDir, 'row.test.ts'), 'it.todo("row");\n');
  git(repoDir, 'add', 'row.test.ts');
  expect((await runHook(repoDir, '000001 fix row width\n\ncontext: a.\n')).status).toBe(0);
  git(repoDir, 'commit', '-m', '000001 fix row width');

  // Amending only the production file keeps the test from the original commit.
  await writeFile(path.join(repoDir, 'row.ts'), 'export const a = 2;\n');
  git(repoDir, 'add', 'row.ts');
  expect((await runHook(repoDir, '000001 fix row width\n\ncontext: a.\n')).status).toBe(0);
  // A new fix commit with only the production file is blocked.
  expect((await runHook(repoDir, '000002 fix row width again\n\ncontext: a.\n')).status).toBe(1);

  const range = spawnSync('node', [SCRIPT_PATH, 'range', 'HEAD', '--strict'], { cwd: repoDir, encoding: 'utf8' });
  expect(range.status).toBe(0);
  expect(range.stdout).toContain('with test 1');
});
