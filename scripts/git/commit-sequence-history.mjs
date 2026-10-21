import { spawnSync } from 'node:child_process';

const NUMBERED_SUBJECT = /^(\d{6})\s+\S/;
// Sequences are global across local and remote-tracking branches, so parallel
// branches never reuse a number and merged history stays continuous.
const SEQUENCE_REFS = ['refs/heads', 'refs/remotes'];

export function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

export function hasHead() {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0;
}

export function parseNumberedSubject(subject) {
  const match = subject.match(NUMBERED_SUBJECT);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function formatSequence(value) {
  return String(value).padStart(6, '0');
}

function readSequenceTips() {
  const refs = runGit(['for-each-ref', '--format=%(objectname)', ...SEQUENCE_REFS]).split('\n').filter(Boolean);
  return hasHead() ? [...refs, 'HEAD'] : refs;
}

export function readCommitSubjects(revisions) {
  if (revisions.length === 0) return [];
  return runGit(['log', '--format=%H%x00%s', ...revisions, '--']).split('\n').filter(Boolean).map((line) => {
    const [sha, subject] = line.split('\0');
    return { sha, subject: subject ?? '', sequence: parseNumberedSubject(subject ?? '') };
  });
}

export function readGlobalSequences({ exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const sequences = new Map();
  readCommitSubjects(readSequenceTips()).forEach(({ sha, sequence }) => {
    if (sequence === null || excluded.has(sha)) return;
    sequences.set(sequence, [...(sequences.get(sequence) ?? []), sha]);
  });
  return sequences;
}

export function getNextGlobalSequence(options) {
  const numbers = [...readGlobalSequences(options).keys()];
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

export function isReferencedCommit(revision) {
  return runGit(['for-each-ref', '--contains', revision, '--format=%(refname)', ...SEQUENCE_REFS])
    .split('\n')
    .some(Boolean);
}
