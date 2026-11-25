#!/usr/bin/env node
/* global console, process */

// Bug-fix commits must carry a test change, or say why not with a `no-test: <reason>` line.
// A commit counts as a bug fix when its subject verb is `fix` or its message cites a
// GitHub Discussion or issue (`Discussion #313`, `issue #265`).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEQUENCE_SUBJECT = /^(\d{6})\s+(.*)$/u;
const FIX_VERB = /^fix\b/iu;
const BUG_REFERENCE = /\b(?:discussions?|issues?)\s+#\d+/iu;
const NO_TEST_LINE = /^no-test:\s*(\S.{2,})$/imu;
const TEST_PATH_PATTERNS = [
  /\.(?:test|spec)\./u,
  /(?:^|\/)(?:tests?|__tests__|androidTest)\//u,
  /(?:^|\/)[^/]*Tests\//u,
  /Tests?\.(?:java|kt|swift)$/u
];

export function cleanMessage(raw) {
  const lines = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (/^# -+ >8 -+$/u.test(line)) break;
    if (!line.startsWith('#')) lines.push(line);
  }
  return lines.join('\n').trim();
}

export function isBugFixMessage(message) {
  const [subject = '', ...body] = message.split(/\r?\n/u);
  const verbSubject = subject.match(SEQUENCE_SUBJECT)?.[2] ?? subject;
  if (/^revert\b/iu.test(verbSubject)) return false;
  return FIX_VERB.test(verbSubject) || BUG_REFERENCE.test([verbSubject, ...body].join('\n'));
}

export function isTestPath(filePath) {
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function evaluateCommit({ message, files }) {
  if (!isBugFixMessage(message)) return { status: 'not-fix' };
  if (files.some(isTestPath)) return { status: 'has-test' };
  const reason = message.match(NO_TEST_LINE)?.[1]?.trim();
  if (reason) return { status: 'no-test', reason };
  return { status: 'missing' };
}

export const HOW_TO_FIX = [
  'This commit looks like a bug fix (subject verb `fix`, or it cites a Discussion/issue number) but changes no test file.',
  'Either:',
  '  1. add or extend a regression test that fails before the fix and passes after it, in the owning module\'s existing test file; or',
  '  2. add a body line `no-test: <reason>` explaining why a test is not possible (for example: native-only behavior covered by smoke F10).',
  'Also register or merge the invariant in .lab/atlas/9reference/core-experience-guards.md when the bug broke a core experience.'
].join('\n');

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function splitLines(text) {
  return (text ?? '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function readCommitFiles(revision) {
  return splitLines(runGit(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', revision]));
}

function readStagedFiles(message) {
  const head = runGit(['rev-parse', '--verify', '-q', 'HEAD'], { allowFailure: true })?.trim();
  if (!head) return splitLines(runGit(['diff', '--cached', '--name-only', '--root']));
  const staged = splitLines(runGit(['diff', '--cached', '--name-only', 'HEAD']));
  // An amend keeps the HEAD sequence; its files are HEAD's own plus whatever is staged now.
  const sequence = message.split(/\r?\n/u)[0].match(SEQUENCE_SUBJECT)?.[1];
  const headSubject = runGit(['show', '-s', '--format=%s', 'HEAD']).trim();
  const headSequence = headSubject.match(SEQUENCE_SUBJECT)?.[1];
  return sequence && sequence === headSequence ? [...new Set([...staged, ...readCommitFiles('HEAD')])] : staged;
}

function checkCommitMessage(messagePath) {
  const message = cleanMessage(readFileSync(messagePath, 'utf8'));
  const result = evaluateCommit({ message, files: readStagedFiles(message) });
  if (result.status !== 'missing') return 0;
  console.error(`error: bug-fix commit without a test.\n${HOW_TO_FIX}`);
  return 1;
}

export function scanRange(range) {
  const shas = splitLines(runGit(['rev-list', '--no-merges', '--reverse', range]));
  return shas.map((sha) => {
    const message = runGit(['show', '-s', '--format=%B', sha]).trim();
    return { sha, subject: message.split(/\r?\n/u)[0], ...evaluateCommit({ message, files: readCommitFiles(sha) }) };
  });
}

function reportRange(range, { strict }) {
  const results = scanRange(range).filter(({ status }) => status !== 'not-fix');
  const missing = results.filter(({ status }) => status === 'missing');
  const noTest = results.filter(({ status }) => status === 'no-test');
  console.log(`Bug-fix commits in ${range}: ${results.length}; with test ${results.length - missing.length - noTest.length}; no-test ${noTest.length}; missing ${missing.length}.`);
  noTest.forEach(({ sha, subject, reason }) => console.log(`  no-test ${sha.slice(0, 9)} ${subject} — ${reason}`));
  missing.forEach(({ sha, subject }) => console.log(`  MISSING ${sha.slice(0, 9)} ${subject}`));
  if (missing.length > 0) {
    console.log('Each MISSING commit needs a regression test added later, or a recorded reason, before release.');
  }
  return strict && missing.length > 0 ? 1 : 0;
}

function main(argv) {
  const [mode, value, ...flags] = argv;
  if (mode === 'commit-msg' && value) return checkCommitMessage(value);
  if (mode === 'range' && value) return reportRange(value, { strict: flags.includes('--strict') });
  console.error('usage: check-fix-has-test.mjs commit-msg <message-file> | range <rev-range> [--strict]');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
