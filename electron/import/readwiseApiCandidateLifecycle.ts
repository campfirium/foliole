import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';

type Candidates = ReturnType<typeof loadReadwiseApiCandidates>;

export function incompleteReadwiseApiCandidateResult(
  stats: { annotationCount: number; committedCount: number; completedCount: number; skippedCount: number },
  candidates: Candidates
) {
  const failedCount = candidates.filter((candidate) => candidate.status === 'failed').length;
  return {
    ...stats,
    failedCount,
    remainingCount: candidates.filter((candidate) => candidate.status !== 'completed').length,
    totalCount: candidates.length
  };
}

export function shouldFetchReadwiseApiCandidateFacts(candidate: Candidates[number]) {
  return candidate.status === 'pending'
    || (candidate.status === 'failed' && candidate.failure?.stage !== 'writing');
}

export function hasLocalReadwiseApiCandidateFacts(candidate: Candidates[number]) {
  return candidate.status === 'completed' || candidate.status === 'ready'
    || (candidate.status === 'failed' && candidate.failure?.stage === 'writing');
}

export function reportReadwiseApiCandidateProgress(
  callback: ((completed: number, total: number, failed: number, unexplained: number) => void) | undefined,
  candidates: Candidates,
  completedCount: number
) {
  const failed = candidates.filter((candidate) => candidate.status === 'failed');
  callback?.(
    completedCount,
    candidates.length,
    failed.length,
    failed.filter((candidate) => !candidate.failure?.reason).length
  );
}

export function readwiseApiCandidateFailureReason(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message.startsWith('readwise_api_rate_limited:')) return 'rate_limited';
  const safeReasons = [
    'readwise_api_candidate_incomplete',
    'readwise_api_reconnect_required',
    'readwise_execution_connection_changed',
    'readwise_execution_eligibility_lost'
  ];
  return safeReasons.includes(error.message) ? error.message : 'request_failed';
}

export function isReadwiseApiCandidateRunStoppingError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (!(error instanceof Error)) return false;
  return error.message.startsWith('readwise_api_rate_limited:')
    || error.message === 'readwise_api_reconnect_required'
    || error.message === 'readwise_execution_eligibility_lost'
    || error.message === 'readwise_execution_connection_changed';
}
