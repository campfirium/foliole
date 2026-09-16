import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadStagedReadwiseApiContracts } from '../database/readwiseApiImportState.js';
import { loadReadwiseCutoverStage, saveReadwiseCutoverStage } from '../database/readwiseCutoverStage.js';
import { writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import {
  planCutoverWorklist,
  type CutoverWorkItem
} from './readwiseCutoverWorklistPlan.js';
import { loadReadwiseSourceArtifacts } from './readwiseSourceCutoverArtifacts.js';
import { migrateReadwiseSourceDispositions } from './readwiseSourceCutoverDispositions.js';
import { freezeReadwiseSourceCutoverMatching } from './readwiseSourceCutoverFrozenMatching.js';
import { createReadwiseSourceCutoverBinding, type ReadwiseSourceCutoverIdentityBinding } from './readwiseSourceCutoverIdentity.js';
import { promoteReadwiseSourceCutoverCohort, recordReadwiseSourceCutoverLegacyFailures, requireReadwiseSourceCutoverV2 } from './readwiseSourceCutoverJournal.js';
import { matchReadwiseSourceCutover } from './readwiseSourceCutoverMatching.js';
import { prepareReadwiseSourceCutoverRouting } from './readwiseSourceCutoverRouting.js';
import { mergeLegacyReadwiseAnnotations } from './readwiseSourceMigrationProjection.js';

type Document = ReturnType<typeof prepareReadwiseApiDocuments>[number];
interface Worklist { items: CutoverWorkItem[]; config: ImportManagerSettings['readwiseReaderConfig'] }
const KIND = 'cutover-worklist-v2';

export type { CutoverWorkItem } from './readwiseCutoverWorklistPlan.js';

export function cutoverItemBinding(item: CutoverWorkItem): ReadwiseSourceCutoverIdentityBinding | null {
  return item.binding ? { ...item.binding, blockedAnnotationIds: new Set(item.binding.blockedAnnotationIds) } : null;
}

export async function prepareCutoverWorklist(connectionRef: string, settings: ImportManagerSettings) {
  const staged = loadStagedReadwiseApiContracts(connectionRef);
  const documents = prepareReadwiseApiDocuments(staged.readerDocuments, staged.exportBooks);
  const saved = loadReadwiseCutoverStage<Worklist>(connectionRef, KIND);
  if (saved) return withMergedAnnotations(documents, saved);
  const artifacts = await loadReadwiseSourceArtifacts();
  return openDatabaseConnection().driver.transaction(() => {
    const matching = matchReadwiseSourceCutover({ artifacts, preparedDocuments: documents, readerDocuments: staged.readerDocuments });
    promoteReadwiseSourceCutoverCohort(documents.map((item) => item.id));
    if (requireReadwiseSourceCutoverV2().legacyMatches === undefined) recordReadwiseSourceCutoverLegacyFailures(matching.failures);
    const frozen = freezeReadwiseSourceCutoverMatching({ artifacts, documents, matching });
    const suppressed = migrateDispositions(connectionRef, documents, staged, artifacts);
    const readersById = new Map(staged.readerDocuments.map((item) => [item.id, item]));
    const routing = prepareReadwiseSourceCutoverRouting({
      artifactFor: frozen.artifactFor, connectionRef, documents, dispositionSuppressed: suppressed, readersById, settings
    });
    const deleted = new Set(staged.exportBooks.flatMap((book) => book.highlights.filter((item) => item.isDeleted).map((item) => item.externalId)));
    const current = requireReadwiseSourceCutoverV2();
    const plan = planCutoverWorklist(documents, routing.destinations, (document) => {
      const artifact = frozen.artifactFor(document.id);
      return artifact ? createReadwiseSourceCutoverBinding(artifact, document, readersById, deleted) : null;
    }, current.documents, new Set(current.failures?.map((item) => item.remoteId)));
    const items = plan.items;
    saveReadwiseCutoverStage(connectionRef, KIND, { items, config: settings.readwiseReaderConfig });
    writeReadwiseSourceCutover({ ...requireReadwiseSourceCutoverV2(), phase: 'merging', updateDocumentIds: items.map((item) => item.remoteId) });
    return withMergedAnnotations(documents, { items, config: settings.readwiseReaderConfig });
  });
}

function migrateDispositions(
  connectionRef: string, documents: Document[], staged: ReturnType<typeof loadStagedReadwiseApiContracts>,
  artifacts: Awaited<ReturnType<typeof loadReadwiseSourceArtifacts>>
) {
  const matching = matchReadwiseSourceCutover({
    artifacts: artifacts.filter((item) => item.disposition).map((item) => ({ ...item, disposition: null, nodeActive: true })),
    preparedDocuments: documents, readerDocuments: staged.readerDocuments
  });
  return migrateReadwiseSourceDispositions(connectionRef, documents.map((item) => item.id), artifacts.flatMap((artifact) => {
    if (!artifact.disposition) return [];
    const match = documents.find((document) => matching.artifactFor(document.id)?.latestNodeId === artifact.latestNodeId);
    return match ? [{ ...artifact, documentIds: new Set([match.id]), remoteDocumentId: match.id }] : [];
  }));
}

function withMergedAnnotations(documents: Document[], work: Worklist) {
  const { items, config } = work;
  const byId = new Map(items.map((item) => [item.remoteId, item.binding]));
  return { config, items, documents: documents.map((document) => mergeLegacyReadwiseAnnotations(
    document, byId.get(document.id)?.legacyAnnotations ?? []
  )) };
}
