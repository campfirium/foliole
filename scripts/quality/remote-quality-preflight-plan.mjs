import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  capPreflightTests, isPreflightTestFile, selectPreflightTests
} from './remote-quality-preflight-select.mjs';

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

// The same base, head and cap yield the same ordered selection on any host;
// `revision` reads the committed head instead of the working tree.
export async function planPreflightSelection({
  base, cap = MAX_PREFLIGHT_TESTS, cwd, git = 'git', head, readText, revision = false, runner
}) {
  const diff = await capturePreflight(runner, git,
    ['diff', '--name-only', '--no-renames', base, head], cwd);
  const changedFiles = diff.split('\n').filter(Boolean);
  const testFiles = await listTestFiles(runner, cwd, git, revision ? head : null);
  const read = readText ?? (revision
    ? revisionTextReader({ cwd, files: testFiles, git, revision: head })
    : (file) => readFileSync(path.join(cwd, file), 'utf8'));
  const entries = selectPreflightTests({ changedFiles, readText: read, testFiles });
  return { cap, changedFiles, entries, ...capPreflightTests(entries, cap) };
}
