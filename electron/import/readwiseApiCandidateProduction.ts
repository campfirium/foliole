import {
  loadPreparedReadwiseApiCandidate,
  loadReadwiseApiCandidates,
  setReadwiseApiCandidateStatus
} from '../database/readwiseApiCandidateStage.js';

import { createReadwiseApiCandidateFactFetcher } from './readwiseApiCandidateFetch.js';
import {
  hasLocalReadwiseApiCandidateFacts,
  incompleteReadwiseApiCandidateResult,
  isReadwiseApiCandidateRunStoppingError,
  readwiseApiCandidateFailureReason,
  shouldFetchReadwiseApiCandidateFacts
} from './readwiseApiCandidateLifecycle.js';
import type { ReadwiseApiCandidatePipelineInput } from './readwiseApiCandidatePipeline.js';
import type { ReadwiseApiPreparedResources } from './readwiseApiDocumentCommit.js';

interface CandidateQueue {
  enqueue: (documentId: string, resources?: ReadwiseApiPreparedResources) => void;
}

interface CandidateStats {
  annotationCount: number;
  committedCount: number;
  completedCount: number;
  skippedCount: number;
}

export async function produceReadwiseApiCandidateFacts(
  input: ReadwiseApiCandidatePipelineInput,
  candidates: ReturnType<typeof loadReadwiseApiCandidates>,
  consumer: CandidateQueue,
  stats: CandidateStats,
  total: number
) {
  markSkippedCandidates(input, candidates, stats, total);
  const activeCandidates = candidates.filter((candidate) => !input.shouldSkipCandidate?.(candidate));
  const fetchFacts = createReadwiseApiCandidateFactFetcher(input.connectionRef, input.dependencies);
  let frozenCount = candidates.length - activeCandidates.length
    + activeCandidates.filter(hasLocalReadwiseApiCandidateFacts).length;
  if (!input.freezeCandidateResources) input.onCandidateFactsProgress?.(frozenCount, total);
  if (!input.deferCommitUntilAllFacts) {
    for (const candidate of activeCandidates.filter(hasLocalReadwiseApiCandidateFacts)) consumer.enqueue(candidate.documentId);
  }
  for (const candidate of activeCandidates.filter(shouldFetchReadwiseApiCandidateFacts)) {
    try {
      input.assertEligible();
      await fetchFacts(candidate);
      frozenCount += 1;
      if (!input.freezeCandidateResources) input.onCandidateFactsProgress?.(frozenCount, total);
      if (!input.deferCommitUntilAllFacts) consumer.enqueue(candidate.documentId);
    } catch (error) {
      setReadwiseApiCandidateStatus(input.connectionRef, candidate.documentId, 'failed', {
        failedAt: new Date().toISOString(), reason: readwiseApiCandidateFailureReason(error), stage: 'fetching'
      });
      if (isReadwiseApiCandidateRunStoppingError(error)) throw error;
    }
  }
}

export async function prepareDeferredReadwiseApiCandidates(
  input: ReadwiseApiCandidatePipelineInput,
  consumer: CandidateQueue,
  stats: CandidateStats,
  total: number
) {
  if (!input.deferCommitUntilAllFacts) return null;
  const candidates = loadReadwiseApiCandidates(input.connectionRef).sort((left, right) =>
    (input.candidatePriority?.(left.documentId) ?? 0) - (input.candidatePriority?.(right.documentId) ?? 0));
  const activeCandidates = candidates.filter((candidate) => !input.shouldSkipCandidate?.(candidate));
  if (activeCandidates.some((candidate) => !hasLocalReadwiseApiCandidateFacts(candidate))) {
    return incompleteReadwiseApiCandidateResult(stats, candidates);
  }
  const resources = new Map<string, ReadwiseApiPreparedResources>();
  let preparedCount = 0;
  for (const candidate of activeCandidates) {
    const document = loadPreparedReadwiseApiCandidate(input.connectionRef, candidate.documentId);
    if (!document) throw new Error('readwise_api_candidate_incomplete');
    if (input.freezeCandidateResources) {
      resources.set(candidate.documentId, await input.freezeCandidateResources(document, candidate.destination));
    }
    preparedCount += 1;
    input.onCandidateFactsProgress?.(preparedCount, total);
  }
  input.onCandidateFactsComplete?.(total);
  for (const candidate of candidates.filter((item) => item.status !== 'completed')) {
    consumer.enqueue(candidate.documentId, resources.get(candidate.documentId));
  }
  return null;
}

function markSkippedCandidates(
  input: ReadwiseApiCandidatePipelineInput,
  candidates: ReturnType<typeof loadReadwiseApiCandidates>,
  stats: CandidateStats,
  total: number
) {
  for (const candidate of candidates) {
    if (candidate.status === 'completed' || !input.shouldSkipCandidate?.(candidate)) continue;
    setReadwiseApiCandidateStatus(input.connectionRef, candidate.documentId, 'completed', null);
    stats.completedCount += 1;
    stats.skippedCount += 1;
    input.onProgress?.(stats.completedCount, total);
  }
}
