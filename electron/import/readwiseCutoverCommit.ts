import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseSourceCutoverFailureStage } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { deleteNodeAttachmentLink } from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiImportSource, saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { readReadwiseApiSourceDisposition } from '../database/readwiseApiSourceDispositions.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { attachReadwiseApiOriginalFile } from './readwiseApiOriginalFile.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';
import { verifyCutoverEpub } from './readwiseCutoverProjection.js';
import { cutoverItemBinding, type CutoverWorkItem } from './readwiseCutoverWorklist.js';
import { recordReadwiseSuppressedCutoverDocuments } from './readwiseSourceCutoverClassification.js';
import { prepareReadwiseCutoverResources } from './readwiseSourceCutoverDocumentStep.js';
import { createReadwiseDocumentMigration } from './readwiseSourceCutoverJournal.js';
import { finalizeReadwiseCutoverOriginalEpub } from './readwiseSourceCutoverOriginalEpub.js';
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
  const nodeId = binding?.nodeId ?? loadReadwiseApiImportSource(input.connectionRef, document.id)?.nodeId ?? null;
  input.onStage('resources');
  const resources = await prepareReadwiseCutoverResources({
    config: input.settings.readwiseReaderConfig, connectionRef: input.connectionRef,
    dependencies: input.dependencies, destination: input.item.destination, document,
    requireFreshOriginalFile: book && Boolean(nodeId)
  });
  input.assertEligible();
  input.onStage('writing');
  openDatabaseConnection().driver.transaction((driver) => {
    if (readReadwiseApiSourceDisposition(driver, input.connectionRef, document.id) === 'hard_deleted') {
      recordReadwiseSuppressedCutoverDocuments([document], new Set([document.id]));
      return;
    }
    const migration = createReadwiseDocumentMigration({ bindingFor: () => binding }, input.connectionRef, { preserveExistingBody: true });
    migration.beforeCommit(input.document);
    const result = materializeReadwiseApiDocument({
      config: input.settings.readwiseReaderConfig, connectionRef: input.connectionRef,
      destination: input.item.destination, document, preparedEpubCover: resources.epubCover ?? null,
      preparedEpubImages: resources.epubImages, forceEpubStructure: Boolean(resources.forceEpubStructure),
      replaceExistingBody: book, preserveTrackedAnnotations: true, relocationPolicy: 'unique'
    });
    persistOriginal(input.connectionRef, document.id, resources.originalFile);
    finalizeReadwiseCutoverOriginalEpub({ connectionRef: input.connectionRef, document, resources, result });
    input.onStage('recording');
    if (result.status === 'imported') verifyCutoverEpub(input.connectionRef, input.document, true);
    migration.afterCommit(document, result);
  });
}

function persistOriginal(
  connectionRef: string, documentId: string,
  original: Awaited<ReturnType<typeof prepareReadwiseCutoverResources>>['originalFile']
) {
  const source = loadReadwiseApiImportSource(connectionRef, documentId);
  if (!source?.nodeId || !original) return;
  if (original.state.status === 'localized') {
    attachReadwiseApiOriginalFile(source.nodeId, original.state);
    const previous = source.state.originalFile;
    if (previous?.status === 'localized' && previous.attachmentId !== original.state.attachmentId) {
      deleteNodeAttachmentLink({ attachmentId: previous.attachmentId, nodeId: source.nodeId, role: 'reference' });
    }
  }
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(source.annotations), connectionRef, documentId,
    sourceFingerprint: source.sourceFingerprint, state: { ...source.state, originalFile: original.state },
    updatedAt: new Date().toISOString()
  });
}
