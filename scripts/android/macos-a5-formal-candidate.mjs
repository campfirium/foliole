import { execFileSync } from 'node:child_process';

function git(repoRoot, args, execute = execFileSync) {
  return execute('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function assertCommittedCandidate(candidate) {
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
  const revisionIndex = args.indexOf('--revision');
  const revision = revisionIndex >= 0 ? args[revisionIndex + 1] : undefined;
  if (revisionIndex >= 0) {
    if (!formal || !/^[0-9a-f]{40}$/u.test(revision ?? '')) {
      throw new Error('--revision requires --formal and a full Git commit SHA.');
    }
    args.splice(revisionIndex, 2);
  }
  const identityIndex = args.indexOf('--identity');
  const identity = identityIndex >= 0 ? args[identityIndex + 1] : undefined;
  if (identityIndex >= 0) {
    if (identity !== 'test') throw new Error('--identity only accepts test.');
    args.splice(identityIndex, 2);
  }
  if (args.length !== 1) {
    throw new Error('Usage: node scripts/android/macos-a5-dev.mjs <registered-action> '
      + '[--formal [--revision <sha>]] [--identity test]');
  }
  return { action: args[0], formal, ...(revision ? { revision } : {}), ...(identity ? { identity } : {}) };
}

export function beginFormalA5Candidate(repoRoot, execute, requestedRevision = 'HEAD') {
  const revision = git(repoRoot, [
    'rev-parse', '--verify', `${requestedRevision}^{commit}`
  ], execute);
  const candidate = {
    revision,
    tree: git(repoRoot, ['rev-parse', '--verify', `${revision}^{tree}`], execute)
  };
  assertCommittedCandidate(candidate);
  return candidate;
}
