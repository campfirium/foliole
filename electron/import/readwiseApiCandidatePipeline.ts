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

import { ensureReadwiseApiCandidateIndex } from './readwiseApiCandidateFetch.js';
import { readwiseApiCandidateFailureReason, reportReadwiseApiCandidateProgress } from './readwiseApiCandidateLifecycle.js';
import {
  prepareDeferredReadwiseApiCandidates,
  produceReadwiseApiCandidateFacts
} from './readwiseApiCandidateProduction.js';
import {
  commitReadwiseApiDocument,
  type ReadwiseApiPreparedResources
} from './readwiseApiDocumentCommit.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import type { ReadwiseApiMaterializationResult } from './readwiseApiMaterialization.js';
import type { ReadwiseApiScopePurpose } from './readwiseApiScopeGate.js';

type ReadwiseApiCandidateAfterCommit = (
  document: PreparedReadwiseApiDocument,
  result: ReadwiseApiMaterializationResult
) => Promise<void> | void;

export type ReadwiseApiCandidatePipelineInput = {
  assertEligible: () => void;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  afterCommit?: ReadwiseApiCandidateAfterCommit;
  beforeCommit?: (document: PreparedReadwiseApiDocument) => Promise<{
    document?: PreparedReadwiseApiDocument;
    replaceExistingBody?: boolean;
    skip?: boolean;
  } | void>;
  deferCommitUntilAllFacts?: boolean;
  freezeCandidateResources?: (
    document: PreparedReadwiseApiDocument,
    destination: ReturnType<typeof loadReadwiseApiCandidates>[number]['destination']
  ) => Promise<ReadwiseApiPreparedResources>;
  onCandidateCount?: (completed: number, total: number, failed: number, unexplained: number) => void;
  onCandidateFactsComplete?: (total: number) => void;
  onCandidateFactsProgress?: (processed: number, total: number) => void;
  onCandidateIndex?: (documentIds: string[]) => void;
  onIndexProgress?: (processed: number) => void;
  onProgress?: (processed: number, total: number) => void;
  purpose?: ReadwiseApiScopePurpose;
  settings: ImportManagerSettings;
};

export async function runReadwiseApiCandidatePipeline(input: ReadwiseApiCandidatePipelineInput) {
  const { connectionRef, dependencies, onIndexProgress, purpose, settings } = input;
  const candidates = await ensureReadwiseApiCandidateIndex(
    settings, connectionRef, dependencies, purpose, onIndexProgress
  );
  const total = candidates.length;
  input.onCandidateIndex?.(candidates.map((candidate) => candidate.documentId));
  const stats = {
    annotationCount: 0,
    committedCount: 0,
    completedCount: candidates.filter((candidate) => candidate.status === 'completed').length,
    skippedCount: 0
  };
  reportReadwiseApiCandidateProgress(input.onCandidateCount, candidates, stats.completedCount);
  const consumer = createCandidateConsumer(input, total, stats);
  await produceReadwiseApiCandidateFacts(input, candidates, consumer, total);
  const incomplete = await prepareDeferredReadwiseApiCandidates(input, consumer, stats, total);
  if (incomplete) return incomplete;
  await consumer.wait();
  return finalizeCandidatePipeline(input, stats, total);
}

function finalizeCandidatePipeline(
  input: Parameters<typeof runReadwiseApiCandidatePipeline>[0],
  stats: { annotationCount: number; committedCount: number; completedCount: number; skippedCount: number },
  total: number
) {
  const candidates = loadReadwiseApiCandidates(input.connectionRef);
  const failedCount = candidates.filter((candidate) => candidate.status === 'failed').length;
  const remainingCount = candidates.filter((candidate) => candidate.status !== 'completed').length;
  if (remainingCount === 0 && input.purpose !== 'cutover') {
    completeReadwiseApiCandidateRun(input.connectionRef, 'sync');
  }
  return { ...stats, failedCount, remainingCount, totalCount: total };
}

function createCandidateConsumer(
  input: Parameters<typeof runReadwiseApiCandidatePipeline>[0],
  total: number,
  stats: { annotationCount: number; committedCount: number; completedCount: number; skippedCount: number }
) {
  let chain = Promise.resolve();
  return {
    enqueue(documentId: string, resources?: ReadwiseApiPreparedResources) {
      chain = chain.then(() => consumeCandidate(input, documentId, total, stats, resources));
    },
    wait: () => chain
  };
}

async function consumeCandidate(
  input: Parameters<typeof runReadwiseApiCandidatePipeline>[0],
  documentId: string,
  total: number,
  stats: { annotationCount: number; committedCount: number; completedCount: number; skippedCount: number },
  preparedResources?: ReadwiseApiPreparedResources
) {
  try {
    input.assertEligible();
    const document = loadPreparedReadwiseApiCandidate(input.connectionRef, documentId);
    const candidate = loadReadwiseApiCandidates(input.connectionRef)
      .find((item) => item.documentId === documentId);
    if (!document) throw new Error('readwise_api_candidate_incomplete');
    if (!candidate) throw new Error('readwise_api_candidate_missing');
    const commitOptions = await input.beforeCommit?.(document);
    if (commitOptions?.skip) {
      await input.afterCommit?.(document, {
        annotationCount: 0,
        documentId: document.id,
        status: 'skipped'
      });
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
      destination: candidate.destination,
      document: commitOptions?.document ?? document,
      ...(preparedResources ? { preparedResources } : {}),
      ...(commitOptions?.replaceExistingBody === undefined
        ? {} : { replaceExistingBody: commitOptions.replaceExistingBody })
    });
    await input.afterCommit?.(commitOptions?.document ?? document, result);
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
        failedAt: new Date().toISOString(), reason: readwiseApiCandidateFailureReason(error), stage: 'writing'
      }
    );
  }
}
