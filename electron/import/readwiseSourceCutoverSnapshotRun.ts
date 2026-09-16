import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseAutoImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  loadStagedReadwiseApiContracts
} from '../database/readwiseApiImportState.js';

import { matchesReadwiseDocumentImportTag } from './readwiseApiCandidateRouting.js';
import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import { prepareReadwiseApiFrozenResources } from './readwiseApiFrozenBatch.js';
import {
  fetchReadwiseSourceCutoverSnapshot,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import { loadReadwiseSourceArtifacts } from './readwiseSourceCutoverArtifacts.js';
import { recordReadwiseSuppressedCutoverDocuments } from './readwiseSourceCutoverClassification.js';
import { migrateReadwiseSourceDispositions } from './readwiseSourceCutoverDispositions.js';
import { createReadwiseSourceCutoverBinding } from './readwiseSourceCutoverIdentity.js';
import {
  createReadwiseDocumentMigration,
  promoteReadwiseSourceCutoverCohort,
  recordReadwiseSourceCutoverLegacyFailures,
  requireReadwiseSourceCutoverV2,
  setReadwiseSourceCutoverPhase
} from './readwiseSourceCutoverJournal.js';
import { matchReadwiseSourceCutover } from './readwiseSourceCutoverMatching.js';

export interface ReadwiseSourceCutoverSnapshotRunInput {
  assertEligible: () => void;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  onProgress: (completed: number, total: number, phase: 'indexing' | 'merging') => void;
  settings: ImportManagerSettings;
}

export async function runReadwiseSourceCutoverSnapshot(input: ReadwiseSourceCutoverSnapshotRunInput) {
  input.assertEligible();
  const staged = await fetchSnapshotFacts(input);
  const context = await prepareCutoverContext(input, staged);
  const completedDocuments = await mergeCutoverDocuments(input, staged, context);
  return { documents: completedDocuments, remainingCount: 0 };
}

async function fetchSnapshotFacts(input: ReadwiseSourceCutoverSnapshotRunInput) {
  let fetched = 0;
  const totals = new Map<'export' | 'reader', number>();
  await fetchReadwiseSourceCutoverSnapshot(input.connectionRef, {
    ...input.dependencies,
    onPage: (page) => {
      fetched += page.recordCount;
      if (page.totalCount !== undefined) totals.set(page.phase, page.totalCount);
      input.dependencies.onPage?.(page);
      input.onProgress(fetched, [...totals.values()].reduce((sum, value) => sum + value, 0), 'indexing');
    }
  });
  return loadStagedReadwiseApiContracts(input.connectionRef);
}

async function prepareCutoverContext(
  input: ReadwiseSourceCutoverSnapshotRunInput,
  staged: ReturnType<typeof loadStagedReadwiseApiContracts>
) {
  const documents = prepareReadwiseApiDocuments(staged.readerDocuments, staged.exportBooks);
  const artifacts = await loadReadwiseSourceArtifacts();
  const matching = matchReadwiseSourceCutover({
    artifacts,
    preparedDocuments: documents,
    readerDocuments: staged.readerDocuments
  });
  const dispositionMatching = matchReadwiseSourceCutover({
    artifacts: artifacts.filter((item) => item.disposition).map((item) => ({
      ...item, disposition: null, nodeActive: true
    })),
    preparedDocuments: documents,
    readerDocuments: staged.readerDocuments
  });
  promoteReadwiseSourceCutoverCohort(documents.map((item) => item.id));
  recordReadwiseSourceCutoverLegacyFailures(matching.failures);
  const suppressed = migrateReadwiseSourceDispositions(
    input.connectionRef,
    documents.map((item) => item.id),
    artifacts.flatMap((artifact) => {
      if (!artifact.disposition) return [];
      const match = documents.find((document) =>
        dispositionMatching.artifactFor(document.id)?.latestNodeId === artifact.latestNodeId);
      return match ? [{ ...artifact, documentIds: new Set([match.id]), remoteDocumentId: match.id }] : [];
    })
  );
  recordReadwiseSuppressedCutoverDocuments(documents, suppressed);
  setReadwiseSourceCutoverPhase('merging');
  const legacyTotal = new Set(artifacts.filter((item) => item.nodeActive && !item.disposition)
    .map((item) => item.latestNodeId)).size;
  let legacyCompleted = matching.failures.length;
  input.onProgress(legacyCompleted, legacyTotal, 'merging');
  return { artifacts, documents, legacyCompleted, legacyTotal, matching, suppressed };
}

async function mergeCutoverDocuments(
  input: ReadwiseSourceCutoverSnapshotRunInput,
  staged: ReturnType<typeof loadStagedReadwiseApiContracts>,
  context: Awaited<ReturnType<typeof prepareCutoverContext>>
) {
  const readersById = new Map(staged.readerDocuments.map((item) => [item.id, item]));
  const deletedAnnotationIds = new Set(staged.exportBooks.flatMap((book) =>
    book.highlights.filter((item) => item.isDeleted).map((item) => item.externalId)));
  const migration = createReadwiseDocumentMigration({
    bindingFor: (document) => {
      const artifact = context.matching.artifactFor(document.id);
      return artifact
        ? createReadwiseSourceCutoverBinding(artifact, document, readersById, deletedAnnotationIds) : null;
    }
  }, input.connectionRef, { preserveExistingBody: true });
  const completedDocuments = new Map(context.documents.map((item) => [item.id, item]));
  for (const document of context.documents) {
    input.assertEligible();
    if (requireReadwiseSourceCutoverV2().documents.some((item) => item.remoteId === document.id)) continue;
    const artifact = context.matching.artifactFor(document.id);
    const destination = destinationFor(document, readersById.get(document.id)?.tags, input.settings);
    const commitDestination = artifact ? 'inbox' : destination;
    if (context.suppressed.has(document.id) || commitDestination === 'off') {
      recordReadwiseSuppressedCutoverDocuments([document], new Set([document.id]));
      continue;
    }
    completedDocuments.set(document.id, await commitSnapshotDocument(
      input, document, commitDestination, migration
    ));
    if (artifact) {
      context.legacyCompleted += 1;
      input.onProgress(context.legacyCompleted, context.legacyTotal, 'merging');
    }
  }
  return [...completedDocuments.values()];
}

async function commitSnapshotDocument(
  input: ReadwiseSourceCutoverSnapshotRunInput,
  document: ReturnType<typeof prepareReadwiseApiDocuments>[number],
  destination: 'external' | 'inbox',
  migration: ReturnType<typeof createReadwiseDocumentMigration>
) {
  const options = await migration.beforeCommit(document);
  const committed = options && 'document' in options && options.document ? options.document : document;
  if (options && 'skip' in options && options.skip) {
    await migration.afterCommit(document, {
      annotationCount: 0, documentId: document.id, status: 'skipped'
    });
    return document;
  }
  const projection = options && 'replaceExistingBody' in options ? options : null;
  const resources = await prepareReadwiseApiFrozenResources({
    config: input.settings.readwiseReaderConfig, connectionRef: input.connectionRef,
    dependencies: input.dependencies, destination, document: committed
  });
  const result = await commitReadwiseApiDocument({
    assertEligible: input.assertEligible, config: input.settings.readwiseReaderConfig,
    connectionRef: input.connectionRef, dependencies: input.dependencies, destination,
    document: committed, preparedResources: resources,
    ...(projection?.forceEpubStructure ? { forceEpubStructure: true } : {}),
    ...(projection?.replaceExistingBody === undefined
      ? {} : { replaceExistingBody: projection.replaceExistingBody })
  });
  await migration.afterCommit(committed, result);
  return committed;
}

function destinationFor(
  document: ReturnType<typeof prepareReadwiseApiDocuments>[number],
  tags: Record<string, unknown> | null | undefined,
  settings: ImportManagerSettings
) {
  return resolveReadwiseAutoImportDestination(
    settings.readwiseAutoImportPolicy,
    document.category,
    document.annotations.length > 0,
    matchesReadwiseDocumentImportTag(tags, settings.readwiseAutoImportPolicy.importTag)
  );
}
