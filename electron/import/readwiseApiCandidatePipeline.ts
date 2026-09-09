import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  completeReadwiseApiCandidateRun
} from '../database/readwiseApiCandidateRun.js';
import {
  loadPreparedReadwiseApiCandidate,
  loadReadwiseApiCandidates,
  setReadwiseApiCandidateStatus
} from '../database/readwiseApiCandidateStage.js';

import {
  createReadwiseApiCandidateFactFetcher,
  ensureReadwiseApiCandidateIndex
} from './readwiseApiCandidateFetch.js';
import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';

export async function runReadwiseApiCandidatePipeline(input: {
  assertEligible: () => void;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  afterCommit?: (document: PreparedReadwiseApiDocument) => Promise<void> | void;
  beforeCommit?: (document: PreparedReadwiseApiDocument) => Promise<{
    document?: PreparedReadwiseApiDocument;
    replaceExistingBody?: boolean;
    skip?: boolean;
  } | void>;
  onCandidateCount?: (completed: number, total: number, failed: number, unexplained: number) => void;
  onCandidateIndex?: (documentIds: string[]) => void;
  onProgress?: (processed: number, total: number) => void;
  settings: ImportManagerSettings;
}) {
  const candidates = await ensureReadwiseApiCandidateIndex(
    input.settings,
    input.connectionRef,
    input.dependencies
  );
  const total = candidates.length;
  input.onCandidateIndex?.(candidates.map((candidate) => candidate.documentId));
  const stats = {
    annotationCount: 0,
    committedCount: 0,
    completedCount: candidates.filter((candidate) => candidate.status === 'completed').length,
    skippedCount: 0
  };
  reportCandidateProgress(input, candidates, stats.completedCount);
  const consumer = createCandidateConsumer(input, total, stats);
  let producerError: unknown = null;
  const fetchFacts = createReadwiseApiCandidateFactFetcher(input.connectionRef, input.dependencies);
  for (const candidate of candidates.filter((item) => item.status === 'ready')) consumer.enqueue(candidate.documentId);
  for (const candidate of candidates.filter((item) => item.status === 'pending' || item.status === 'failed')) {
    try {
      input.assertEligible();
      await fetchFacts(candidate);
      consumer.enqueue(candidate.documentId);
    } catch (error) {
      setReadwiseApiCandidateStatus(input.connectionRef, candidate.documentId, 'failed', {
        failedAt: new Date().toISOString(), reason: failureReason(error), stage: 'fetching'
      });
      if (isRunStoppingError(error)) {
        producerError = error;
        break;
      }
    }
  }
  await consumer.wait();
  if (producerError) throw producerError;
  const finalCandidates = loadReadwiseApiCandidates(input.connectionRef);
  const failedCount = finalCandidates.filter((candidate) => candidate.status === 'failed').length;
  const remainingCount = finalCandidates.filter((candidate) => candidate.status !== 'completed').length;
  if (remainingCount === 0) completeReadwiseApiCandidateRun(input.connectionRef);
  return { ...stats, failedCount, remainingCount, totalCount: total };
}

function reportCandidateProgress(
  input: Parameters<typeof runReadwiseApiCandidatePipeline>[0],
  candidates: ReturnType<typeof loadReadwiseApiCandidates>,
  completedCount: number
) {
  const failed = candidates.filter((candidate) => candidate.status === 'failed');
  input.onCandidateCount?.(
    completedCount,
    candidates.length,
    failed.length,
    failed.filter((candidate) => !candidate.failure?.reason).length
  );
}

function createCandidateConsumer(
  input: Parameters<typeof runReadwiseApiCandidatePipeline>[0],
  total: number,
  stats: { annotationCount: number; committedCount: number; completedCount: number; skippedCount: number }
) {
  let chain = Promise.resolve();
  return {
    enqueue(documentId: string) {
      chain = chain.then(() => consumeCandidate(input, documentId, total, stats));
    },
    wait: () => chain
  };
}

async function consumeCandidate(
  input: Parameters<typeof runReadwiseApiCandidatePipeline>[0],
  documentId: string,
  total: number,
  stats: { annotationCount: number; committedCount: number; completedCount: number; skippedCount: number }
) {
  try {
    input.assertEligible();
    const document = loadPreparedReadwiseApiCandidate(input.connectionRef, documentId);
    if (!document) throw new Error('readwise_api_candidate_incomplete');
    const commitOptions = await input.beforeCommit?.(document);
    if (commitOptions?.skip) {
      setReadwiseApiCandidateStatus(input.connectionRef, documentId, 'completed', null);
      stats.skippedCount += 1;
      stats.completedCount += 1;
      input.onProgress?.(stats.completedCount, total);
      return;
    }
    const result = await commitReadwiseApiDocument({
      assertEligible: input.assertEligible,
      config: input.settings.readwiseReaderConfig,
      connectionRef: input.connectionRef,
      dependencies: input.dependencies,
      document: commitOptions?.document ?? document,
      ...(commitOptions?.replaceExistingBody === undefined
        ? {} : { replaceExistingBody: commitOptions.replaceExistingBody })
    });
    await input.afterCommit?.(commitOptions?.document ?? document);
    stats.annotationCount += result.annotationCount;
    setReadwiseApiCandidateStatus(input.connectionRef, documentId, 'completed', null);
    stats.committedCount += 1;
    stats.completedCount += 1;
    input.onProgress?.(stats.completedCount, total);
  } catch (error) {
    console.error('[readwise-candidate] candidate failed', { documentId, error });
    setReadwiseApiCandidateStatus(
      input.connectionRef,
      documentId,
      input.dependencies.signal?.aborted ? 'ready' : 'failed',
      input.dependencies.signal?.aborted ? undefined : {
        failedAt: new Date().toISOString(), reason: failureReason(error), stage: 'writing'
      }
    );
  }
}

function failureReason(error: unknown) {
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

function isRunStoppingError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (!(error instanceof Error)) return false;
  return error.message.startsWith('readwise_api_rate_limited:')
    || error.message === 'readwise_api_reconnect_required'
    || error.message === 'readwise_execution_eligibility_lost'
    || error.message === 'readwise_execution_connection_changed';
}
