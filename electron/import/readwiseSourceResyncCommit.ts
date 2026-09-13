import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiImportSource, saveReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { readReadwiseApiEpubBookBodies } from './readwiseApiEpubMaterialization.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { relocateReadwiseOriginalEpubLocalAnchors } from './readwiseOriginalEpubLocalAnchors.js';
import {
  captureReadwiseSourceLocalAnchors,
  relocateReadwiseSourceLocalAnchors
} from './readwiseSourceResyncLocalAnchors.js';
import type { PreparedReadwiseSourceResync } from './readwiseSourceResyncPreparation.js';
import {
  captureReadwiseSourceResyncSnapshot,
  readReadwiseSourceResyncRuntimeStatus,
  type ReadwiseSourceResyncTarget
} from './readwiseSourceResyncTarget.js';

export function commitReadwiseSourceResync(input: {
  candidate: PreparedReadwiseSourceResync;
  expectedSnapshot: string;
  importedAt: string;
  target: ReadwiseSourceResyncTarget;
}) {
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    if (readReadwiseSourceResyncRuntimeStatus(input.target) !== 'ready'
      || captureReadwiseSourceResyncSnapshot(input.target) !== input.expectedSnapshot) {
      throw new Error('readwise_resync_target_changed');
    }
    const isEpub = input.candidate.document.category === 'epub';
    const sourceBefore = loadReadwiseApiImportSource(input.target.connectionRef, input.target.documentId);
    if (!sourceBefore) throw new Error('readwise_resync_target_missing');
    const localAnchors = isEpub ? [] : captureReadwiseSourceLocalAnchors(
      input.target.nodeId,
      new Set(sourceBefore.state.annotations.map((state) => state.nodeId))
    );
    const result = materializeReadwiseApiDocument({
      allowOriginalEpubReplacement: true,
      config: createDefaultReadwiseReaderConfig(),
      connectionRef: input.target.connectionRef,
      destination: 'inbox',
      document: input.candidate.document,
      importedAt: input.importedAt,
      preparedEpubCover: input.candidate.cover,
      preparedEpubImages: input.candidate.images,
      preserveTrackedAnnotations: true,
      relocationPolicy: 'unique',
      relocateAllAnnotations: true,
      replaceExistingBody: true,
      resetImportedStructure: true,
      ...(isEpub ? { forceEpubStructure: true } : {})
    });
    if (result.status !== 'imported') throw new Error('readwise_resync_commit_failed');
    relocateLocalAnchors(input, isEpub, localAnchors);
    persistReaderAuthority(input);
    return result;
  });
}

function relocateLocalAnchors(
  input: Parameters<typeof commitReadwiseSourceResync>[0],
  isEpub: boolean,
  localAnchors: ReturnType<typeof captureReadwiseSourceLocalAnchors>
) {
  const source = loadReadwiseApiImportSource(input.target.connectionRef, input.target.documentId);
  if (!source) throw new Error('readwise_resync_target_missing');
  if (isEpub) {
    relocateReadwiseOriginalEpubLocalAnchors({
      annotationStates: source.state.annotations,
      bodies: readReadwiseApiEpubBookBodies(input.target.nodeId),
      connectionRef: input.target.connectionRef,
      documentId: input.target.documentId,
      importedAt: input.importedAt,
      rootNodeId: input.target.nodeId
    });
    return;
  }
  relocateReadwiseSourceLocalAnchors({
    importedAt: input.importedAt,
    localAnchors,
    rootNodeId: input.target.nodeId
  });
}

function persistReaderAuthority(input: Parameters<typeof commitReadwiseSourceResync>[0]) {
  const source = loadReadwiseApiImportSource(input.target.connectionRef, input.target.documentId);
  if (!source) throw new Error('readwise_resync_target_missing');
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(source.annotations),
    connectionRef: input.target.connectionRef,
    documentId: input.target.documentId,
    sourceFingerprint: source.sourceFingerprint,
    state: { ...source.state, bodyAuthority: 'reader_html', sourceUpdate: null },
    updatedAt: input.importedAt
  });
}
