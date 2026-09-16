import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  loadStagedReadwiseApiContracts
} from '../database/readwiseApiImportState.js';

import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import {
  fetchReadwiseSourceCutoverSnapshot,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import { loadReadwiseSourceArtifacts } from './readwiseSourceCutoverArtifacts.js';
import {
  recordReadwiseSourceCutoverActiveDocument,
  recordReadwiseSourceCutoverFailure,
  recordReadwiseSuppressedCutoverDocuments
} from './readwiseSourceCutoverClassification.js';
import { migrateReadwiseSourceDispositions } from './readwiseSourceCutoverDispositions.js';
import {
  prepareReadwiseCutoverResources,
  readwiseCutoverDocumentFailureReason
} from './readwiseSourceCutoverDocumentStep.js';
import { freezeReadwiseSourceCutoverMatching } from './readwiseSourceCutoverFrozenMatching.js';
import { createReadwiseSourceCutoverBinding } from './readwiseSourceCutoverIdentity.js';
import {
  createReadwiseDocumentMigration,
  promoteReadwiseSourceCutoverCohort,
  recordReadwiseSourceCutoverLegacyFailures,
  requireReadwiseSourceCutoverV2,
  setReadwiseSourceCutoverPhase
} from './readwiseSourceCutoverJournal.js';
import { matchReadwiseSourceCutover } from './readwiseSourceCutoverMatching.js';
import { prepareReadwiseSourceCutoverRouting } from './readwiseSourceCutoverRouting.js';

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
  if (requireReadwiseSourceCutoverV2().legacyMatches === undefined) {
    recordReadwiseSourceCutoverLegacyFailures(matching.failures);
  }
  const frozenMatching = freezeReadwiseSourceCutoverMatching({ artifacts, documents, matching });
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
  const current = requireReadwiseSourceCutoverV2();
  const legacyNodes = new Set((frozenMatching.failures).map((item) => item.nodeId));
  for (const item of current.documents) {
    const artifact = frozenMatching.artifactFor(item.remoteId);
    if (artifact) legacyNodes.add(artifact.latestNodeId);
  }
  const legacyTotal = frozenMatching.legacyTotal;
  let legacyCompleted = legacyNodes.size;
  input.onProgress(legacyCompleted, legacyTotal, 'merging');
  return {
    artifacts, documents, legacyCompleted, legacyTotal, matching: frozenMatching, suppressed
  };
}

async function mergeCutoverDocuments(
  input: ReadwiseSourceCutoverSnapshotRunInput,
  staged: ReturnType<typeof loadStagedReadwiseApiContracts>,
  context: Awaited<ReturnType<typeof prepareCutoverContext>>
) {
  const readersById = new Map(staged.readerDocuments.map((item) => [item.id, item]));
  const deletedAnnotationIds = new Set(staged.exportBooks.flatMap((book) =>
    book.highlights.filter((item) => item.isDeleted).map((item) => item.externalId)));
  const bindingFor = (document: (typeof context.documents)[number]) => {
    const artifact = context.matching.artifactFor(document.id);
    return artifact
      ? createReadwiseSourceCutoverBinding(artifact, document, readersById, deletedAnnotationIds) : null;
  };
  const migration = createReadwiseDocumentMigration({ bindingFor }, input.connectionRef, {
    preserveExistingBody: true
  });
  const routing = prepareReadwiseSourceCutoverRouting({
    artifactFor: context.matching.artifactFor,
    dispositionSuppressed: context.suppressed,
    documents: context.documents,
    readersById,
    settings: input.settings
  });
  const completedDocuments = new Map(context.documents.map((item) => [item.id, item]));
  for (const document of context.documents) {
    input.assertEligible();
    if (routing.terminalDocumentIds.has(document.id)) continue;
    const artifact = context.matching.artifactFor(document.id);
    const commitDestination = routing.destinations.get(document.id) ?? 'off';
    if (commitDestination === 'off') continue;
    let stage: Parameters<typeof recordReadwiseSourceCutoverFailure>[0]['stage'] = 'preparing';
    try {
      completedDocuments.set(document.id, await commitSnapshotDocument(
        input, document, commitDestination, migration, (next) => {
          stage = next;
          recordReadwiseSourceCutoverActiveDocument({ document, stage: next });
        }
      ));
    } catch (error) {
      const reason = readwiseCutoverDocumentFailureReason(error);
      console.error('[readwise-cutover] document skipped', {
        reason, remoteId: document.id, stage, title: document.title
      });
      let binding = null;
      try { binding = bindingFor(document); } catch { /* the failure remains isolated to this document */ }
      recordReadwiseSourceCutoverFailure({ binding, document, reason, stage });
    }
    routing.terminalDocumentIds.add(document.id);
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
  migration: ReturnType<typeof createReadwiseDocumentMigration>,
  onStage: (stage: Parameters<typeof recordReadwiseSourceCutoverFailure>[0]['stage']) => void
) {
  onStage('preparing');
  const options = await migration.beforeCommit(document);
  const committed = options && 'document' in options && options.document ? options.document : document;
  if (options && 'skip' in options && options.skip) {
    await migration.afterCommit(document, {
      annotationCount: 0, documentId: document.id, status: 'skipped'
    });
    return document;
  }
  const projection = options && 'replaceExistingBody' in options ? options : null;
  onStage('resources');
  const resources = await prepareReadwiseCutoverResources({
    config: input.settings.readwiseReaderConfig,
    connectionRef: input.connectionRef,
    dependencies: input.dependencies,
    destination,
    document: committed
  });
  onStage('writing');
  const result = await commitReadwiseApiDocument({
    assertEligible: input.assertEligible, config: input.settings.readwiseReaderConfig,
    connectionRef: input.connectionRef, dependencies: input.dependencies, destination,
    document: committed, preparedResources: resources,
    ...(projection?.forceEpubStructure ? { forceEpubStructure: true } : {}),
    ...(projection?.replaceExistingBody === undefined
      ? {} : { replaceExistingBody: projection.replaceExistingBody })
  });
  onStage('recording');
  await migration.afterCommit(committed, result);
  return committed;
}
