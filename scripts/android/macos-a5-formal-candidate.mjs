import { execFileSync } from 'node:child_process';

function git(repoRoot, args, execute = execFileSync) {
  return execute('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function assertCommittedDev(candidate) {
  if (!/^[0-9a-f]{40}$/u.test(candidate.revision)) {
    throw new Error('Formal A5 acceptance requires a full Git revision.');
  }
  if (!/^[0-9a-f]{40}$/u.test(candidate.tree)) {
    throw new Error('Formal A5 acceptance requires a full Git tree identity.');
  }
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
  const revision = git(repoRoot, [
    'rev-parse', '--verify', 'refs/heads/dev^{commit}'
  ], execute);
  const candidate = {
    revision,
    tree: git(repoRoot, ['rev-parse', '--verify', `${revision}^{tree}`], execute)
  };
  assertCommittedDev(candidate);
  return candidate;
}

export function finishFormalA5Candidate(expected) {
  if (!expected) return null;
  assertCommittedDev(expected);
  return expected.revision;
}
