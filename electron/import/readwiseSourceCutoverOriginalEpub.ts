import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import type { ReadwiseApiPreparedResources } from './readwiseApiDocumentCommit.js';
import type { ReadwiseApiMaterializationResult } from './readwiseApiMaterialization.js';
import { commitReadwiseOriginalEpubDuringCutover } from './readwiseOriginalEpubCommit.js';
import {
  captureReadwiseOriginalEpubSnapshot,
  loadReadwiseOriginalEpubTarget
} from './readwiseOriginalEpubTarget.js';

export function finalizeReadwiseCutoverOriginalEpub(input: {
  connectionRef: string;
  document: PreparedReadwiseApiDocument;
  resources: ReadwiseApiPreparedResources;
  result: ReadwiseApiMaterializationResult;
}) {
  if (!input.resources.originalEpub || input.result.status !== 'imported') return;
  const source = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  const target = source?.nodeId ? loadReadwiseOriginalEpubTarget(source.nodeId) : null;
  if (!target) throw new Error('original_epub_target_missing');
  commitReadwiseOriginalEpubDuringCutover({
    candidate: input.resources.originalEpub,
    document: input.document,
    expectedSnapshot: captureReadwiseOriginalEpubSnapshot(target),
    importedAt: new Date().toISOString(),
    target
  });
}
