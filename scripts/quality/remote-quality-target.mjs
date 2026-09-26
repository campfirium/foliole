export function normalizeRemoteQualitySourceRef(value) {
  const sourceRef = value || 'refs/heads/dev';
  if (sourceRef !== 'refs/heads/dev') throw new Error('--source-ref must be refs/heads/dev');
  return sourceRef;
}

export function remoteQualitySourceBranch(sourceRef) {
  normalizeRemoteQualitySourceRef(sourceRef);
  return 'dev';
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
  defaultBranch, localBranch, sourceRef
}) {
  const sourceBranch = assertRemoteQualityRepositoryContext({ defaultBranch, localBranch, sourceRef });
  return sourceBranch;
}
