#!/usr/bin/env node
/* global console, process */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

import {
  formatSequence,
  getNextGlobalSequence,
  hasHead,
  isReferencedCommit,
  parseNumberedSubject,
  readCommitSubjects,
  readGlobalSequences,
  runGit
} from './commit-sequence-history.mjs';

const ZERO_SHA = /^0{40}$/;
const COMMIT_CONTEXT_PREFIX = '# foliole-commit-context: ';

function getHeadSequence() {
  return hasHead() ? parseNumberedSubject(runGit(['show', '-s', '--format=%s', 'HEAD']).trim()) : null;
}

function prepareCommitContext(messagePath, source, sourceCommit) {
  appendFileSync(messagePath, `\n${COMMIT_CONTEXT_PREFIX}${source ?? ''} ${sourceCommit ?? ''}\n`, 'utf8');
}

function readAmendedSequence(messagePath) {
  const message = readFileSync(messagePath, 'utf8');
  const lines = message.split(/\r?\n/u);
  const contextLine = lines.find((line) => line.startsWith(COMMIT_CONTEXT_PREFIX));
  if (!contextLine) {
    return null;
  }
  const [source, sourceCommit] = contextLine.slice(COMMIT_CONTEXT_PREFIX.length).trim().split(/\s+/u);
  writeFileSync(messagePath, lines.filter((line) => line !== contextLine).join('\n'), 'utf8');
  if (source !== 'commit' || !sourceCommit) {
    return null;
  }
  const head = runGit(['rev-parse', 'HEAD']).trim();
  const resolvedSource = runGit(['rev-parse', sourceCommit]).trim();
  if (resolvedSource !== head) {
    return null;
  }
  return parseNumberedSubject(runGit(['show', '-s', '--format=%s', resolvedSource]).trim());
}

function checkCommitMessage(messagePath) {
  const subject = readFileSync(messagePath, 'utf8').split(/\r?\n/u)[0] ?? '';
  const actual = parseNumberedSubject(subject);
  const amended = readAmendedSequence(messagePath);
  const expected = amended ?? getNextGlobalSequence();
  const headSequence = getHeadSequence();

  // `--amend -m` carries no source commit; reference-transaction still rejects reuse by a new commit.
  if (actual === expected || (amended === null && actual === headSequence)) {
    return;
  }

  const expectedText = formatSequence(expected);
  const actualText = actual === null ? 'missing' : formatSequence(actual);
  console.error(`error: commit subject must start with next sequence ${expectedText}; got ${actualText}.`);
  process.exit(1);
}

function readCommitIdentity(revision) {
  const [parents, subject] = runGit(['show', '-s', '--format=%P%x00%s', revision]).trim().split('\0');
  return {
    parents: parents ? parents.split(/\s+/u) : [],
    sequence: parseNumberedSubject(subject ?? '')
  };
}

function checkReferenceUpdate({ oldSha, newSha, refName }) {
  if (!refName.startsWith('refs/heads/') || ZERO_SHA.test(oldSha) || ZERO_SHA.test(newSha)) return;
  const oldCommit = readCommitIdentity(oldSha);
  const newCommit = readCommitIdentity(newSha);
  if (newCommit.parents[0] === oldSha) {
    // A fast-forward to a commit another branch already holds was checked when that commit was made.
    if (isReferencedCommit(newSha)) return;
    const expected = getNextGlobalSequence({ exclude: [newSha] });
    if (newCommit.sequence !== expected) {
      throw new Error(`${refName} new commit sequence must be ${formatSequence(expected)}.`);
    }
    return;
  }
  if (oldCommit.parents.join(' ') === newCommit.parents.join(' ') && newCommit.sequence !== oldCommit.sequence) {
    throw new Error(`${refName} amended commit must keep sequence ${formatSequence(oldCommit.sequence)}.`);
  }
}

function checkReferenceTransaction(input, state) {
  if (state !== 'prepared') return;
  input.split(/\r?\n/u).filter(Boolean).forEach((line) => {
    const [oldSha, newSha, refName] = line.trim().split(/\s+/u);
    if (oldSha && newSha && refName) checkReferenceUpdate({ oldSha, newSha, refName });
  });
}

function readPushedCommits({ localSha, remoteSha }, extraArgs = []) {
  const known = ZERO_SHA.test(remoteSha) ? [] : [remoteSha];
  return readCommitSubjects([...extraArgs, localSha, '--not', '--remotes', ...known]);
}

function checkUniqueSequences(commits, refName, taken) {
  const seen = new Set();
  commits.forEach(({ subject, sequence }) => {
    if (sequence === null) {
      throw new Error(`${refName} contains an unnumbered commit subject: ${subject}`);
    }
    if (taken.has(sequence) || seen.has(sequence)) {
      throw new Error(`${refName} contains duplicate sequence ${formatSequence(sequence)}.`);
    }
    seen.add(sequence);
  });
  return seen;
}

function checkContinuousSequences(pushed, refName, taken) {
  const sorted = [...pushed].sort((left, right) => left - right);
  const below = [...taken.keys()].filter((value) => value < sorted[0]);
  let expected = below.length > 0 ? Math.max(...below) + 1 : 1;
  sorted.forEach((actual) => {
    for (; expected < actual; expected += 1) {
      if (!taken.has(expected)) {
        throw new Error(`${refName} sequence must be ${formatSequence(expected)}; got ${formatSequence(actual)}.`);
      }
    }
    expected = actual + 1;
  });
}

function checkIncreasingBranch(update) {
  const sequences = readPushedCommits(update, ['--first-parent']).map(({ sequence }) => sequence).reverse();
  sequences.forEach((sequence, index) => {
    if (index > 0 && sequence <= sequences[index - 1]) {
      const previous = formatSequence(sequences[index - 1]);
      throw new Error(`${update.remoteRef} sequence must increase along the branch: ${formatSequence(sequence)} after ${previous}.`);
    }
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
    if (ZERO_SHA.test(update.localSha) || !update.localRef.startsWith('refs/heads/')) continue;
    const commits = readPushedCommits(update);
    if (commits.length === 0) continue;
    const taken = readGlobalSequences({ exclude: commits.map(({ sha }) => sha) });
    const pushed = checkUniqueSequences(commits, update.remoteRef, taken);
    checkContinuousSequences(pushed, update.remoteRef, taken);
    checkIncreasingBranch(update);
  }
}

function main() {
  const [mode, messagePath, source, sourceCommit] = process.argv.slice(2);
  if (mode === 'prepare-commit-msg' && messagePath) {
    prepareCommitContext(messagePath, source, sourceCommit);
    return;
  }
  if (mode === 'commit-msg' && messagePath) {
    checkCommitMessage(messagePath);
    return;
  }
  if (mode === 'pre-push') {
    checkPrePush(readFileSync(0, 'utf8'));
    return;
  }
  if (mode === 'reference-transaction') {
    checkReferenceTransaction(readFileSync(0, 'utf8'), messagePath);
    return;
  }
  if (mode === 'next') {
    console.log(formatSequence(getNextGlobalSequence()));
    return;
  }
  console.error('usage: check-commit-sequence.mjs commit-msg <message-file> | pre-push | reference-transaction <state> | next');
  process.exit(2);
}

try {
  main();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
