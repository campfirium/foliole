#!/usr/bin/env node
/* global console, process */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const NUMBERED_SUBJECT = /^(\d{6})\s+\S/;
const ZERO_SHA = /^0{40}$/;

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function hasHead() {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0;
}

function parseNumberedSubject(subject) {
  const match = subject.match(NUMBERED_SUBJECT);
  return match ? Number.parseInt(match[1], 10) : null;
}

function readHeadSubjects() {
  if (!hasHead()) {
    return [];
  }
  return runGit(['log', '--first-parent', '--pretty=%s']).split('\n').filter(Boolean);
}

function getNextSequence() {
  const numbers = readHeadSubjects().map(parseNumberedSubject).filter((value) => value !== null);
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return max + 1;
}

function formatSequence(value) {
  return String(value).padStart(6, '0');
}

function checkCommitMessage(messagePath) {
  const subject = readFileSync(messagePath, 'utf8').split(/\r?\n/u)[0] ?? '';
  const actual = parseNumberedSubject(subject);
  const expected = getNextSequence();

  if (actual === expected) {
    return;
  }

  const expectedText = formatSequence(expected);
  const actualText = actual === null ? 'missing' : formatSequence(actual);
  console.error(`error: commit subject must start with next sequence ${expectedText}; got ${actualText}.`);
  process.exit(1);
}

function readSubjects(revision) {
  return runGit(['log', '--first-parent', '--reverse', '--pretty=%s', revision]).split('\n').filter(Boolean);
}

function getMaxSequence(subjects) {
  const numbers = subjects.map(parseNumberedSubject).filter((value) => value !== null);
  return numbers.length > 0 ? Math.max(...numbers) : 0;
}

function checkContinuousSubjects(subjects, refName, start = 1) {
  const seen = new Set();
  let expected = start;

  subjects.forEach((subject) => {
    const actual = parseNumberedSubject(subject);
    if (actual === null) {
      throw new Error(`${refName} contains an unnumbered commit subject: ${subject}`);
    }
    if (actual !== expected) {
      const actualText = actual === null ? 'missing' : formatSequence(actual);
      throw new Error(`${refName} sequence must be ${formatSequence(expected)}; got ${actualText}.`);
    }
    if (seen.has(actual)) {
      throw new Error(`${refName} contains duplicate sequence ${formatSequence(actual)}.`);
    }
    seen.add(actual);
    expected += 1;
  });
}

function parsePrePushInput(input) {
  return input
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }));
}

function checkPrePush(input) {
  for (const update of parsePrePushInput(input)) {
    if (ZERO_SHA.test(update.localSha) || !update.localRef.startsWith('refs/heads/')) {
      continue;
    }
    if (ZERO_SHA.test(update.remoteSha)) {
      checkContinuousSubjects(readSubjects(update.localSha), update.remoteRef);
      continue;
    }
    const expected = getMaxSequence(readSubjects(update.remoteSha)) + 1;
    checkContinuousSubjects(readSubjects(`${update.remoteSha}..${update.localSha}`), update.remoteRef, expected);
  }
}

function main() {
  const [mode, messagePath] = process.argv.slice(2);
  if (mode === 'commit-msg' && messagePath) {
    checkCommitMessage(messagePath);
    return;
  }
  if (mode === 'pre-push') {
    checkPrePush(readFileSync(0, 'utf8'));
    return;
  }
  console.error('usage: check-commit-sequence.mjs commit-msg <message-file> | pre-push');
  process.exit(2);
}

try {
  main();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
