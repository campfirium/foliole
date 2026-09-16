import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import { prepareReadwiseApiFrozenResources } from './readwiseApiFrozenBatch.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { recordReadwiseSuppressedCutoverDocuments } from './readwiseSourceCutoverClassification.js';
import { prepareReadwiseSourceCutoverIdentity } from './readwiseSourceCutoverIdentity.js';
import {
  createReadwiseDocumentMigration,
  promoteReadwiseSourceCutoverCohort,
  requireReadwiseSourceCutoverV2,
  setReadwiseSourceCutoverPhase
} from './readwiseSourceCutoverJournal.js';
import { runReadwiseSourceCutoverUnbound } from './readwiseSourceCutoverUnboundRun.js';

export interface ReadwiseSourceCutoverExactRunInput {
  assertEligible: () => void;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  onProgress: (completed: number, total: number, phase: 'indexing' | 'merging') => void;
  settings: ImportManagerSettings;
}

type CutoverIdentity = Awaited<ReturnType<typeof prepareReadwiseSourceCutoverIdentity>>;
type MigrationDocuments = ReturnType<CutoverIdentity['migrationDocuments']>;

export async function runReadwiseSourceCutoverExact(input: ReadwiseSourceCutoverExactRunInput) {
  input.assertEligible();
  const identity = await prepareIdentityOrNull(input);
  if (!identity) return runReadwiseSourceCutoverUnbound(input);
  const documents = identity.migrationDocuments();
  const documentIds = documents.map((document) => document.id);
  identity.assertCandidateCoverage(documentIds);
  promoteReadwiseSourceCutoverCohort(documentIds);
  const suppressed = identity.migrateDispositions(documentIds);
  recordReadwiseSuppressedCutoverDocuments(documents, suppressed);
  input.onProgress(0, documents.length, 'indexing');

  const classified = new Set(requireReadwiseSourceCutoverV2().documents.map((item) => item.remoteId));
  const pending = documents.filter((document) => !classified.has(document.id) && !suppressed.has(document.id));
  const resources = await prepareResources(input, pending, documents.length);

  setReadwiseSourceCutoverPhase('merging');
  input.onProgress(documents.length - pending.length, documents.length, 'merging');
  const migration = createReadwiseDocumentMigration(identity, input.connectionRef, {
    forceSourceProjection: true
  });
  let completed = documents.length - pending.length;
  for (const document of pending) {
    input.assertEligible();
    const options = await migration.beforeCommit(document);
    const prepared = options && 'document' in options ? options : null;
    const shouldSkip = Boolean(options && 'skip' in options && options.skip);
    const committedDocument = prepared?.document ?? document;
    const result = shouldSkip
      ? skipped(document.id)
      : await commitReadwiseApiDocument({
        assertEligible: input.assertEligible,
        config: input.settings.readwiseReaderConfig,
        connectionRef: input.connectionRef,
        dependencies: input.dependencies,
        destination: 'inbox',
        document: committedDocument,
        ...(prepared?.forceEpubStructure ? { forceEpubStructure: true } : {}),
        ...(resources.get(document.id) ? { preparedResources: resources.get(document.id)! } : {}),
        ...(prepared?.replaceExistingBody === undefined
          ? {} : { replaceExistingBody: prepared.replaceExistingBody })
      });
    await migration.afterCommit(committedDocument, result);
    completed += 1;
    input.onProgress(completed, documents.length, 'merging');
  }
  return { documents, remainingCount: 0 };
}

async function prepareIdentityOrNull(input: ReadwiseSourceCutoverExactRunInput) {
  try {
    return await prepareReadwiseSourceCutoverIdentity(input.connectionRef, input.dependencies);
  } catch (error) {
    if (error instanceof Error && error.message === 'readwise_source_cutover_identity_unavailable') return null;
    throw error;
  }
}

async function prepareResources(
  input: ReadwiseSourceCutoverExactRunInput,
  documents: MigrationDocuments,
  total: number
) {
  const resources = new Map<string, Awaited<ReturnType<typeof prepareReadwiseApiFrozenResources>>>();
  let prepared = total - documents.length;
  for (const document of documents) {
    input.assertEligible();
    resources.set(document.id, await prepareReadwiseApiFrozenResources({
      config: input.settings.readwiseReaderConfig,
      connectionRef: input.connectionRef,
      dependencies: input.dependencies,
      destination: 'inbox',
      document
    }));
    prepared += 1;
    input.onProgress(prepared, total, 'indexing');
  }
  return resources;
}

function skipped(documentId: string) {
  return {
    annotationCount: 0,
    documentId,
    status: 'skipped' as const
  };
}

export type ReadwiseSourceCutoverExactResult = Awaited<ReturnType<typeof runReadwiseSourceCutoverExact>>;
