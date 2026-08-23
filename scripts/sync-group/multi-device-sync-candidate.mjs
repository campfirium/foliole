import { execFileSync } from 'node:child_process';
import {
  branchForCandidateSourceRef, DEFAULT_CANDIDATE_SOURCE_REF, normalizeCandidateSourceRef
} from './multi-device-sync-source-ref.mjs';

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export function currentAcceptanceCandidate(repoRoot, mode = 'diagnostic',
  sourceRef = DEFAULT_CANDIDATE_SOURCE_REF) {
  const status = git(repoRoot, ['status', '--porcelain']);
  const branch = git(repoRoot, ['branch', '--show-current']);
  const normalizedSourceRef = normalizeCandidateSourceRef(sourceRef);
  if (branch !== branchForCandidateSourceRef(normalizedSourceRef)) {
    throw new Error(`Candidate branch ${branch || '<detached>'} does not match ${normalizedSourceRef}`);
  }
  return {
    branch, clean: status === '',
    committed: true,
    mode, revision: git(repoRoot, ['rev-parse', 'HEAD']),
    sourceRef: normalizedSourceRef,
    treeDigest: git(repoRoot, ['rev-parse', 'HEAD^{tree}'])
  };
}
