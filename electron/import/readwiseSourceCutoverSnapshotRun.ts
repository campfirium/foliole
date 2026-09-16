import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { ReadwiseSourceCutoverFailureStage } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { loadReadwiseSourceMigrationProgress } from '../database/readwiseSourceCutover.js';

import { fetchReadwiseSourceCutoverSnapshot, type ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { commitCutoverItem } from './readwiseCutoverCommit.js';
import { readCutoverDownloadProgress } from './readwiseCutoverDownload.js';
import { verifyCutoverEpub } from './readwiseCutoverProjection.js';
import { cutoverItemBinding, prepareCutoverWorklist } from './readwiseCutoverWorklist.js';
import { recordReadwiseSourceCutoverActiveDocument, recordReadwiseSourceCutoverFailure } from './readwiseSourceCutoverClassification.js';
import { readwiseCutoverDocumentFailureReason } from './readwiseSourceCutoverDocumentStep.js';
import { requireReadwiseSourceCutoverV2 } from './readwiseSourceCutoverJournal.js';

export interface ReadwiseSourceCutoverSnapshotRunInput {
  assertEligible: () => void;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  onProgress: (completed: number, total: number, phase: 'indexing' | 'merging') => void;
  settings: ImportManagerSettings;
}

export async function runReadwiseSourceCutoverSnapshot(input: ReadwiseSourceCutoverSnapshotRunInput) {
  input.assertEligible();
  const publishDownload = () => {
    const progress = readCutoverDownloadProgress(input.connectionRef);
    input.onProgress(progress.completed, progress.total ?? 0, 'indexing');
  };
  if (requireReadwiseSourceCutoverV2().phase !== 'merging') publishDownload();
  await fetchReadwiseSourceCutoverSnapshot(input.connectionRef, {
    ...input.dependencies, onPage: (page) => { input.dependencies.onPage?.(page); publishDownload(); }
  });
  const work = await prepareCutoverWorklist(input.connectionRef, input.settings);
  await updateDocuments({ ...input, settings: { ...input.settings, readwiseReaderConfig: work.config } }, work);
  return { documents: work.documents, remainingCount: 0 };
}

async function updateDocuments(
  input: ReadwiseSourceCutoverSnapshotRunInput,
  work: Awaited<ReturnType<typeof prepareCutoverWorklist>>
) {
  const documents = new Map(work.documents.map((document) => [document.id, document]));
  const terminals = new Map(requireReadwiseSourceCutoverV2().documents.map((item) => [item.remoteId, item]));
  const publish = () => {
    const progress = loadReadwiseSourceMigrationProgress();
    input.onProgress(progress.completedCount, progress.totalCount, 'merging');
  };
  publish();
  for (const item of work.items) {
    input.assertEligible();
    const document = documents.get(item.remoteId);
    if (!document) throw new Error('readwise_source_cutover_worklist_incomplete');
    const terminal = terminals.get(item.remoteId);
    if (terminal) {
      if (terminal.status === 'bound' || terminal.status === 'materialized') verifyCutoverEpub(input.connectionRef, document);
      continue;
    }
    let stage: ReadwiseSourceCutoverFailureStage = 'preparing';
    recordReadwiseSourceCutoverActiveDocument({ document, stage });
    try {
      await commitCutoverItem({ ...input, document, item, onStage: (next) => {
        stage = next;
        recordReadwiseSourceCutoverActiveDocument({ document, stage });
      } });
    } catch (error) {
      input.assertEligible();
      recordReadwiseSourceCutoverFailure({
        binding: cutoverItemBinding(item), document,
        reason: readwiseCutoverDocumentFailureReason(error),
        stage
      });
    }
    publish();
  }
}
