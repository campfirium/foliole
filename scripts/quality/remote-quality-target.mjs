const SOURCE_BRANCHES = new Map([
  ['refs/heads/dev', 'dev'],
  ['refs/heads/sync', 'sync']
]);

export function normalizeRemoteQualitySourceRef(value) {
  const sourceRef = value || 'refs/heads/dev';
  if (!SOURCE_BRANCHES.has(sourceRef)) {
    throw new Error('--source-ref must be refs/heads/dev or refs/heads/sync');
  }
  return sourceRef;
}

export function assertRemoteQualitySourceScope(sourceRef, scope) {
  if (sourceRef === 'refs/heads/sync' && !['android', 'ios'].includes(scope)) {
    throw new Error('Remote sync quality supports only android or ios scope');
  }
}

export function remoteQualitySourceBranch(sourceRef) {
  return SOURCE_BRANCHES.get(normalizeRemoteQualitySourceRef(sourceRef));
}

export function parseRemoteBranchSha(value, branch) {
  const sha = value.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Remote ${branch} HEAD did not resolve to a full 40-character lowercase commit SHA`);
  }
  return sha;
}

export function assertRemoteQualityRepositoryContext({ defaultBranch, localBranch, sourceRef }) {
  const sourceBranch = remoteQualitySourceBranch(sourceRef);
  if (defaultBranch !== 'dev') {
    throw new Error('Remote Quality requires the repository default branch to be dev');
  }
  if (localBranch !== sourceBranch) {
    throw new Error(`Remote Quality source ${sourceRef} requires the local ${sourceBranch} branch`);
  }
  return sourceBranch;
}

export function assertRemoteQualitySourceContext({
  defaultBranch, localBranch, localHead, remoteSha, sourceRef
}) {
  const sourceBranch = assertRemoteQualityRepositoryContext({ defaultBranch, localBranch, sourceRef });
  if (sourceBranch === 'sync' && localHead !== remoteSha) {
    throw new Error('Remote Quality requires local sync HEAD to exactly match origin/sync');
  }
  return sourceBranch;
}
