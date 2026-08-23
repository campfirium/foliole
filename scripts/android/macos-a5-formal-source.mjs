import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const FULL_SHA = /^[0-9a-f]{40}$/u;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function assertAcceptedSourceIdentity(identity) {
  const revision = identity.acceptedRevision ?? identity.revision;
  const tree = identity.acceptedTree ?? identity.treeDigest;
  if (!FULL_SHA.test(revision ?? '') || !FULL_SHA.test(tree ?? '')) {
    throw new Error('Accepted source identity requires a full commit and tree SHA.');
  }
  return { revision, tree };
}

export function acceptedSourceReceipt(context, execute = execFileSync) {
  const frozen = context.formalSourceClass === 'frozen-build';
  if (!frozen) return { lockfileDigest: null, source: {
    acceptedRevision: context.acceptedRevision, acceptedTree: context.acceptedTree,
    archiveDigest: null, formalSourceClass: context.formalSourceClass
  } };
  const identity = assertAcceptedSourceIdentity(context);
  const tree = execute('git', ['rev-parse', '--verify', `${identity.revision}^{tree}`], {
    cwd: context.sourceRepoRoot, encoding: 'utf8'
  }).trim();
  if (tree !== identity.tree) throw new Error('Accepted revision and tree do not match.');
  const lockfile = execute('git', ['show', `${identity.revision}:package-lock.json`], {
    cwd: context.sourceRepoRoot
  });
  return { lockfileDigest: sha256(lockfile), source: {
    acceptedRevision: identity.revision, acceptedTree: identity.tree,
    archiveDigest: null, formalSourceClass: context.formalSourceClass
  } };
}
