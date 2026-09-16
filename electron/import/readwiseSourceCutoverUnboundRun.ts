import { loadPreparedReadwiseApiCandidate } from '../database/readwiseApiCandidateStage.js';

import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import type { ReadwiseSourceCutoverExactRunInput } from './readwiseSourceCutoverExactRun.js';
import {
  createReadwiseDocumentMigration,
  promoteReadwiseSourceCutoverCohort,
  setReadwiseSourceCutoverPhase
} from './readwiseSourceCutoverJournal.js';

export async function runReadwiseSourceCutoverUnbound(input: ReadwiseSourceCutoverExactRunInput) {
  let documentIds: string[] = [];
  const migration = createReadwiseDocumentMigration({ bindingFor: () => null }, input.connectionRef);
  const output = await runReadwiseApiCandidatePipeline({
    assertEligible: input.assertEligible,
    beforeCommit: (document) => migration.beforeCommit(document),
    afterCommit: (document, result) => migration.afterCommit(document, result),
    connectionRef: input.connectionRef,
    deferCommitUntilAllFacts: true,
    dependencies: input.dependencies,
    onCandidateFactsComplete: (total) => beginMerge(input, total),
    onCandidateFactsProgress: (completed, total) => input.onProgress(completed, total, 'indexing'),
    onCandidateIndex: (ids) => {
      documentIds = ids;
      promoteReadwiseSourceCutoverCohort(ids);
      input.onProgress(0, ids.length, 'indexing');
    },
    onProgress: (completed, total) => input.onProgress(completed, total, 'merging'),
    purpose: 'cutover',
    settings: input.settings
  });
  return { documents: loadDocuments(input.connectionRef, documentIds), remainingCount: output.remainingCount };
}

function beginMerge(input: ReadwiseSourceCutoverExactRunInput, total: number) {
  setReadwiseSourceCutoverPhase('merging');
  input.onProgress(0, total, 'merging');
}

function loadDocuments(connectionRef: string, documentIds: string[]) {
  const documents = documentIds.map((id) => loadPreparedReadwiseApiCandidate(connectionRef, id));
  if (documents.some((document) => !document)) throw new Error('readwise_api_candidate_incomplete');
  return documents.filter((document): document is NonNullable<typeof document> => Boolean(document));
}
