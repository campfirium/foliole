import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseApiAnnotationState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { resolveReadwiseApiAnnotationStates } from './readwiseApiAnnotationState.js';
import {
  hasPersistedReadwiseApiEpubStructure,
  materializeReadwiseApiEpub
} from './readwiseApiEpubMaterialization.js';
import type {
  ReadwiseApiMaterializationInput,
  ReadwiseApiMaterializationResult
} from './readwiseApiMaterialization.js';
import type { persistReadwiseApiSourceUpdate } from './readwiseApiSourceUpdate.js';

export function prepareReadwiseApiMaterializationState(
  input: ReadwiseApiMaterializationInput,
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  importedAt: string,
  sourceUpdate: ReturnType<typeof persistReadwiseApiSourceUpdate>
) {
  const annotationStates = resolveReadwiseApiAnnotationStates(existing, importedAt, {
    annotations: input.document.annotations,
    connectionRef: input.connectionRef,
    resetTracked: Boolean(input.forceEpubStructure && !input.preserveTrackedAnnotations)
  });
  const existingIds = new Set(annotationStates.map((state) => state.remoteId));
  const newAnnotations = input.relocateAllAnnotations
    ? input.document.annotations
    : input.document.annotations.filter((annotation) => !existingIds.has(annotation.remoteId));
  return {
    annotationStates,
    epubResult: materializeEpubIfStructured(input, existing, importedAt, annotationStates, newAnnotations, sourceUpdate),
    newAnnotations
  };
}

function materializeEpubIfStructured(
  input: ReadwiseApiMaterializationInput,
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  importedAt: string,
  annotationStates: ReadwiseApiAnnotationState[],
  newAnnotations: PreparedReadwiseApiDocument['annotations'],
  sourceUpdate: ReturnType<typeof persistReadwiseApiSourceUpdate>
): ReadwiseApiMaterializationResult | null {
  const canCreate = input.document.category === 'epub' && Boolean(input.document.epubStructure);
  const alreadyStructured = Boolean(existing?.nodeId)
    && hasPersistedReadwiseApiEpubStructure(existing?.nodeId ?? '');
  if (!(canCreate && (!existing || input.forceEpubStructure)) && !alreadyStructured) return null;
  return materializeReadwiseApiEpub({
    annotationStates,
    connectionRef: input.connectionRef,
    document: input.document,
    existingSourceFingerprint: existing?.sourceFingerprint ?? (input.reimportDeleted
      ? loadReadwiseApiImportSource(input.connectionRef, input.document.id)?.sourceFingerprint ?? null : null),
    importedAt,
    newAnnotations,
    previousState: existing ? { ...existing.state, sourceUpdate } : null,
    preparedImages: input.preparedEpubImages,
    relocationPolicy: input.relocationPolicy ?? 'first',
    rebuildRoot: Boolean(existing && input.forceEpubStructure),
    rootNodeId: existing?.nodeId ?? null
  });
}
