import type { ReadwiseApiCandidate } from './readwiseApiCandidateTypes.js';

export function isReadwiseApiCandidateBlockedByCutover(
  candidate: ReadwiseApiCandidate,
  status: string | null | undefined
) {
  if (status === 'blocked') return true;
  return status === 'suppressed' && candidate.matchedImportTag !== true;
}
