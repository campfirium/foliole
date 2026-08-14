export const DEFAULT_CANDIDATE_SOURCE_REF = 'refs/heads/dev';

export function normalizeCandidateSourceRef(value = DEFAULT_CANDIDATE_SOURCE_REF) {
  if (typeof value !== 'string' || !value.startsWith('refs/heads/')) {
    throw new Error('Candidate source ref must be an explicit refs/heads ref');
  }
  const branch = value.slice('refs/heads/'.length);
  if (!branch || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..')
      || branch.includes('@{') || /[~^:?*[\\\s]/u.test(branch)) {
    throw new Error('Candidate source ref is invalid');
  }
  return value;
}

export function branchForCandidateSourceRef(value) {
  return normalizeCandidateSourceRef(value).slice('refs/heads/'.length);
}
