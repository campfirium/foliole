import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { persistStagedManagedAttachment } from '../attachments/managedAttachmentFileStage.js';
import { createNodeAttachmentLink } from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';
import {
  loadReadwiseApiImportSource,
  saveReadwiseApiImportSource
} from '../database/readwiseApiImportState.js';

import { readReadwiseApiEpubBookBodies } from './readwiseApiEpubMaterialization.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { relocateReadwiseOriginalEpubLocalAnchors } from './readwiseOriginalEpubLocalAnchors.js';
import type { PreparedOriginalEpubCandidate } from './readwiseOriginalEpubPreparation.js';
import {
  captureReadwiseOriginalEpubSnapshot,
  isReadwiseOriginalEpubRuntimeReady,
  type ReadwiseOriginalEpubTarget
} from './readwiseOriginalEpubTarget.js';

function withOriginalEpubBody(input: {
  candidate: PreparedOriginalEpubCandidate;
  document: PreparedReadwiseApiDocument;
  target: ReadwiseOriginalEpubTarget;
}): PreparedReadwiseApiDocument {
  const sections = input.candidate.images.sections;
  return {
    ...input.document,
    body: [input.candidate.images.rootBody, ...sections.map((section) => section.content)]
      .filter(Boolean).join('\n\n'),
    degradedReason: null,
    epubStructure: {
      degradedReason: null,
      imageCount: input.candidate.images.accounting.sourceBodyCount,
      markerCount: sections.length,
      rootBody: input.candidate.images.rootBody,
      sections
    },
    title: input.target.title
  };
}

function persistOriginalEpubAuthority(input: {
  candidate: PreparedOriginalEpubCandidate;
  importedAt: string;
  target: ReadwiseOriginalEpubTarget;
}) {
  const source = loadReadwiseApiImportSource(input.target.connectionRef, input.target.documentId);
  if (!source) throw new Error('original_epub_target_missing');
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(source.annotations),
    connectionRef: input.target.connectionRef,
    documentId: input.target.documentId,
    sourceFingerprint: input.target.sourceFingerprint,
    state: {
      ...source.state,
      bodyAuthority: 'original_epub',
      originalFile: {
        attachmentId: input.candidate.epubAttachment.contentHash,
        contentHash: input.candidate.epubAttachment.contentHash,
        mimeType: input.candidate.epubAttachment.mimeType,
        reason: null,
        sizeBytes: input.candidate.epubAttachment.sizeBytes,
        status: 'localized'
      },
      sourceUpdate: null
    },
    updatedAt: input.importedAt
  });
}

export function commitReadwiseOriginalEpub(input: {
  candidate: PreparedOriginalEpubCandidate;
  document: PreparedReadwiseApiDocument;
  expectedSnapshot: string;
  importedAt: string;
  target: ReadwiseOriginalEpubTarget;
}) {
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    if (!isReadwiseOriginalEpubRuntimeReady(input.target)
      || captureReadwiseOriginalEpubSnapshot(input.target) !== input.expectedSnapshot) {
      throw new Error('original_epub_target_changed');
    }
    for (const stage of input.candidate.stages) persistStagedManagedAttachment(stage);
    const document = withOriginalEpubBody(input);
    const result = materializeReadwiseApiDocument({
      allowOriginalEpubReplacement: true,
      config: createDefaultReadwiseReaderConfig(),
      connectionRef: input.target.connectionRef,
      destination: 'inbox',
      document,
      forceEpubStructure: true,
      importedAt: input.importedAt,
      preparedEpubImages: input.candidate.images,
      preserveTrackedAnnotations: true,
      relocationPolicy: 'unique',
      relocateAllAnnotations: true,
      replaceExistingBody: true
    });
    if (result.status !== 'imported') throw new Error('original_epub_commit_failed');
    const materialized = loadReadwiseApiImportSource(input.target.connectionRef, input.target.documentId);
    if (!materialized) throw new Error('original_epub_target_missing');
    relocateReadwiseOriginalEpubLocalAnchors({
      annotationStates: materialized.state.annotations,
      bodies: readReadwiseApiEpubBookBodies(input.target.nodeId),
      connectionRef: input.target.connectionRef,
      documentId: input.target.documentId,
      importedAt: input.importedAt,
      rootNodeId: input.target.nodeId
    });
    createNodeAttachmentLink({
      attachmentId: input.candidate.epubAttachment.contentHash,
      nodeId: input.target.nodeId,
      role: 'reference'
    });
    persistOriginalEpubAuthority(input);
    return result;
  });
}
