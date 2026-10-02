import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { isReadwiseApiCandidateRunStoppingError } from './readwiseApiCandidateLifecycle.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';
import { commitCutoverItem } from './readwiseCutoverCommit.js';
import { cutoverItemBinding, type CutoverWorkItem } from './readwiseCutoverWorklist.js';
import { recordReadwiseSourceCutoverFailure } from './readwiseSourceCutoverClassification.js';
import { readwiseCutoverDocumentFailureReason } from './readwiseSourceCutoverDocumentStep.js';

const KEY = 'readwise_source_cutover_failed_facts';
interface FailedCutoverFacts {
  connectionRef: string;
  documents: PreparedReadwiseApiDocument[];
  work: { items: CutoverWorkItem[]; config: ReadwiseReaderConfig };
}

export async function recoverReadwiseCutoverFailures(input: {
  assertEligible: () => void;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
}) {
  const facts = await runWithDatabaseConnectionOwner(() => loadJsonSetting(KEY) as FailedCutoverFacts | null);
  if (!facts || facts.connectionRef !== input.connectionRef) return;
  for (const document of facts.documents) {
    await runWithDatabaseConnectionOwner(async () => {
      input.assertEligible();
      const current = loadReadwiseSourceCutover();
      if (current?.version !== 2 || current.status !== 'api'
        || !current.failures?.some((item) => item.remoteId === document.id)) return;
      const item = facts.work.items.find((item) => item.remoteId === document.id);
      if (!item) throw new Error('readwise_source_cutover_worklist_incomplete');
      let stage: 'preparing' | 'resources' | 'writing' | 'recording' = 'preparing';
      try {
        await commitCutoverItem({ ...input, document, item,
          settings: { ...loadImportManagerSettings(), readwiseReaderConfig: facts.work.config },
          onStage: (next) => { stage = next; }
        });
      } catch (error) {
        // The failed item transaction rolled back; its existing content and binding remain intact.
        recordReadwiseSourceCutoverFailure({ binding: cutoverItemBinding(item), document,
          reason: readwiseCutoverDocumentFailureReason(error), stage });
        if (isReadwiseApiCandidateRunStoppingError(error)) throw error;
      }
    });
  }
  await runWithDatabaseConnectionOwner(() => {
    input.assertEligible();
    const current = loadReadwiseSourceCutover();
    const remaining = new Set(current?.version === 2 ? current.failures?.map((item) => item.remoteId) : []);
    const documents = facts.documents.filter((item) => remaining.has(item.id));
    saveJsonSetting(KEY, documents.length ? { ...facts, documents } : null);
  });
}
