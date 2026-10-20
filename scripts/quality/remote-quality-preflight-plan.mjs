import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  budgetPreflightTests, parsePreflightDurations, PREFLIGHT_DURATIONS_FILE
} from './remote-quality-preflight-budget.mjs';
import { isPreflightTestFile, selectPreflightTests } from './remote-quality-preflight-select.mjs';
import { isWindowsRemoteTestFile } from './remote-quality-preflight-windows-scope.mjs';

export const MAX_PREFLIGHT_TESTS = 120;

export async function capturePreflight(runner, command, args, cwd) {
  const result = await runner(command, args, { cwd });
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

// Reads every requested blob of one revision through a single cat-file
// process, so the selection sees the committed target rather than the worktree.
export function revisionTextReader({ cwd, files, git = 'git', revision, run = spawnSync }) {
  const result = run(git, ['cat-file', '--batch'], {
    cwd, input: files.map((file) => `${revision}:${file}\n`).join(''),
    maxBuffer: 512 * 1024 * 1024, windowsHide: true
  });
  if (result.status !== 0) throw new Error(`git cat-file --batch failed for ${revision}`);
  const output = Buffer.from(result.stdout);
  const texts = new Map();
  let offset = 0;
  for (const file of files) {
    const end = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, end).toString('utf8');
    const size = Number(header.split(' ')[2]);
    if (!Number.isSafeInteger(size)) throw new Error(`git cat-file did not return ${file}`);
    texts.set(file, output.subarray(end + 1, end + 1 + size).toString('utf8'));
    offset = end + 2 + size;
  }
  return (file) => texts.get(file) ?? '';
}

async function listTestFiles(runner, cwd, git, revision) {
  const args = revision ? ['ls-tree', '-r', '--name-only', revision] : ['ls-files'];
  const output = await capturePreflight(runner, git, args, cwd);
  return output.split('\n').filter(isPreflightTestFile);
}

// Durations come from the same tree as the tests, so every host budgets alike.
async function readDurations({ cwd, git, head, host, revision, runner }) {
  if (!revision) {
    const file = path.join(cwd, PREFLIGHT_DURATIONS_FILE);
    return parsePreflightDurations(existsSync(file) ? readFileSync(file, 'utf8') : '', host);
  }
  const result = await runner(git, ['show', `${head}:${PREFLIGHT_DURATIONS_FILE}`], { cwd });
  return parsePreflightDurations(result.code === 0 ? result.stdout : '', host);
}

// The same base, head, cap and preflight host yield the same ordered selection
// wherever it is planned; `revision` reads the committed head instead of the working tree.
// A Windows preflight only selects tests that a hosted Windows leaf runs.
export async function planPreflightSelection({
  base, cap = MAX_PREFLIGHT_TESTS, cwd, git = 'git', head, host = 'mac', readText, revision = false, runner
}) {
  const diff = await capturePreflight(runner, git,
    ['diff', '--name-only', '--no-renames', base, head], cwd);
  const changedFiles = diff.split('\n').filter(Boolean);
  const testFiles = (await listTestFiles(runner, cwd, git, revision ? head : null))
    .filter((file) => host !== 'windows' || isWindowsRemoteTestFile(file));
  const read = readText ?? (revision
    ? revisionTextReader({ cwd, files: testFiles, git, revision: head })
    : (file) => readFileSync(path.join(cwd, file), 'utf8'));
  const entries = selectPreflightTests({ changedFiles, readText: read, testFiles });
  const durations = await readDurations({ cwd, git, head, host, revision, runner });
  return { cap, changedFiles, entries, ...budgetPreflightTests(entries, { cap, durations }) };
}
