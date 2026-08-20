import { execFileSync } from 'node:child_process';

function git(repoRoot, args, execute = execFileSync) {
  return execute('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function inspectCandidate(repoRoot, execute) {
  return {
    branch: git(repoRoot, ['branch', '--show-current'], execute),
    revision: git(repoRoot, ['rev-parse', 'HEAD'], execute),
    status: git(repoRoot, ['status', '--porcelain', '--untracked-files=all'], execute)
  };
}

function assertCommittedDev(candidate) {
  if (candidate.branch !== 'dev') throw new Error('Formal A5 acceptance requires the dev branch.');
  if (!/^[0-9a-f]{40}$/u.test(candidate.revision)) {
    throw new Error('Formal A5 acceptance requires a full Git revision.');
  }
  if (candidate.status) throw new Error('Formal A5 acceptance requires a clean committed worktree.');
}

export function parseMacosA5Invocation(argv) {
  const args = [...argv];
  const formalIndex = args.indexOf('--formal');
  const formal = formalIndex >= 0;
  if (formal) args.splice(formalIndex, 1);
  if (args.length !== 1) {
    throw new Error('Usage: node scripts/android/macos-a5-dev.mjs <registered-action> [--formal]');
  }
  return { action: args[0], formal };
}

export function beginFormalA5Candidate(repoRoot, execute) {
  const candidate = inspectCandidate(repoRoot, execute);
  assertCommittedDev(candidate);
  return candidate;
}

export function finishFormalA5Candidate(expected, repoRoot, execute) {
  if (!expected) return null;
  const current = inspectCandidate(repoRoot, execute);
  assertCommittedDev(current);
  if (current.revision !== expected.revision) {
    throw new Error('Formal A5 acceptance revision changed during the action.');
  }
  return current.revision;
}
