import type { ReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import {
  loadOrCreateReadwiseApiCandidateRun,
  restartReadwiseApiCandidateRun
} from '../database/readwiseApiCandidateRun.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

export function restartIncompleteReadwiseSourceCutover(input: {
  connectionRef: string;
  policy: ReadwiseAutoImportPolicy;
  sourceHost: string;
  startedAt: string;
}) {
  const restartedAt = new Date().toISOString();
  const frozenCandidates = loadReadwiseApiCandidates(input.connectionRef);
  const state = writeReadwiseSourceCutover({
    annotations: [],
    batchId: `${input.connectionRef}:${input.startedAt}`,
    cohortDocumentIds: frozenCandidates.map((candidate) => candidate.documentId),
    completedAt: restartedAt,
    documents: [],
    phase: 'indexing',
    retiredNodeIds: [],
    sourceHost: input.sourceHost,
    startedAt: input.startedAt,
    status: 'migration-in-progress'
  }, restartedAt);
  if (frozenCandidates.length > 0) {
    loadOrCreateReadwiseApiCandidateRun(input.connectionRef, input.policy, input.startedAt);
  } else {
    restartReadwiseApiCandidateRun(input.connectionRef, input.policy, input.startedAt);
  }
  return state;
}
