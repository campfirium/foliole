import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseSourceCutoverFailureStage } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { deleteNodeAttachmentLink } from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiImportSource, saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { readReadwiseApiSourceDisposition } from '../database/readwiseApiSourceDispositions.js';

import { readReadwiseApiEpubBookBodies } from './readwiseApiEpubMaterialization.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';
import {
  captureReadwiseBookRootTexts,
  relocateReadwiseBookLocalAnchors
} from './readwiseBookLocalAnchors.js';
import { verifyCutoverEpub } from './readwiseCutoverProjection.js';
import { cutoverItemBinding, type CutoverWorkItem } from './readwiseCutoverWorklist.js';
import { recordReadwiseSuppressedCutoverDocuments } from './readwiseSourceCutoverClassification.js';
import { prepareReadwiseCutoverResources } from './readwiseSourceCutoverDocumentStep.js';
import { createReadwiseDocumentMigration } from './readwiseSourceCutoverJournal.js';
import { mergeLegacyReadwiseAnnotations } from './readwiseSourceMigrationProjection.js';

export async function commitCutoverItem(input: {
  assertEligible: () => void;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  document: PreparedReadwiseApiDocument;
  item: CutoverWorkItem;
  onStage: (stage: ReadwiseSourceCutoverFailureStage) => void;
  settings: ImportManagerSettings;
}) {
  const binding = cutoverItemBinding(input.item);
  const document = mergeLegacyReadwiseAnnotations(input.document, binding?.legacyAnnotations ?? []);
  const book = document.category === 'epub' || document.category === 'pdf';
  input.onStage('resources');
  const resources = await prepareReadwiseCutoverResources({
    config: input.settings.readwiseReaderConfig, connectionRef: input.connectionRef,
    destination: input.item.destination, document,
    rebuildBook: document.category === 'epub' && Boolean(binding)
  });
  input.assertEligible();
  input.onStage('writing');
  openDatabaseConnection().driver.transaction((driver) => {
    if (readReadwiseApiSourceDisposition(driver, input.connectionRef, document.id) === 'hard_deleted') {
      recordReadwiseSuppressedCutoverDocuments([document], new Set([document.id]));
      return;
    }
    const importedAt = new Date().toISOString();
    const preservedRootTexts = document.category === 'epub' && binding
      ? captureReadwiseBookRootTexts(binding.nodeId)
      : undefined;
    const migration = createReadwiseDocumentMigration({ bindingFor: () => binding }, input.connectionRef, { preserveExistingBody: true });
    migration.beforeCommit(input.document);
    const result = materializeReadwiseApiDocument({
      allowOriginalEpubReplacement: book,
      config: input.settings.readwiseReaderConfig, connectionRef: input.connectionRef,
      destination: input.item.destination, document, preparedEpubCover: resources.epubCover ?? null,
      preparedEpubImages: resources.epubImages, forceEpubStructure: Boolean(resources.forceEpubStructure),
      importedAt, replaceExistingBody: book, preserveTrackedAnnotations: true, relocationPolicy: 'unique'
    });
    clearCutoverOriginalFile(input.connectionRef, document.id, result.status, importedAt);
    relocateBookLocalAnchors(
      input.connectionRef, document, result.status, importedAt, preservedRootTexts
    );
    input.onStage('recording');
    if (result.status === 'imported') verifyCutoverEpub(input.connectionRef, input.document, true);
    migration.afterCommit(document, result);
  });
}

function relocateBookLocalAnchors(
  connectionRef: string,
  document: PreparedReadwiseApiDocument,
  status: ReturnType<typeof materializeReadwiseApiDocument>['status'],
  importedAt: string,
  preservedRootTexts?: ReadonlyMap<string, string | null>
) {
  if (document.category !== 'epub' || status !== 'imported') return;
  const source = loadReadwiseApiImportSource(connectionRef, document.id);
  if (!source?.nodeId) throw new Error('readwise_epub_import_source_missing');
  relocateReadwiseBookLocalAnchors({
    annotationStates: source.state.annotations,
    bodies: readReadwiseApiEpubBookBodies(source.nodeId),
    connectionRef,
    documentId: document.id,
    importedAt,
    ...(preservedRootTexts ? { preservedRootTexts } : {}),
    rootNodeId: source.nodeId
  });
}

function clearCutoverOriginalFile(
  connectionRef: string,
  documentId: string,
  status: ReturnType<typeof materializeReadwiseApiDocument>['status'],
  importedAt: string
) {
  if (status !== 'imported') return;
  const source = loadReadwiseApiImportSource(connectionRef, documentId);
  if (!source?.nodeId) throw new Error('readwise_import_source_missing');
  const original = source.state.originalFile;
  if (original?.status === 'localized') {
    deleteNodeAttachmentLink({ attachmentId: original.attachmentId, nodeId: source.nodeId, role: 'reference' });
  }
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(source.annotations),
    connectionRef,
    documentId,
    sourceFingerprint: source.sourceFingerprint,
    state: { ...source.state, bodyAuthority: 'reader_html', originalFile: null },
    updatedAt: importedAt
  });
}
