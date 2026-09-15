import { createHash } from 'node:crypto';

import type { PreparedReadwiseApiDocument } from './readwiseApiImport.js';

type ReadwiseApiEpubStructure = NonNullable<PreparedReadwiseApiDocument['epubStructure']>;

export const READWISE_API_EPUB_PROJECTION_VERSION = 1;

export interface ReadwiseApiEpubProjectionProof {
  sourceHash: string;
  version: number;
}

export function createReadwiseApiEpubProjectionProof(
  document: PreparedReadwiseApiDocument
): ReadwiseApiEpubProjectionProof | null {
  if (document.category !== 'epub' || !document.epubStructure) return null;
  return createReadwiseApiEpubStructureProjectionProof(document.epubStructure);
}

export function createReadwiseApiEpubStructureProjectionProof(
  structure: ReadwiseApiEpubStructure
): ReadwiseApiEpubProjectionProof {
  const source = {
    rootBody: structure.rootBody,
    sections: structure.sections.map((section) => ({
      content: section.content,
      headingLevel: section.headingLevel,
      markerKey: section.markerKey,
      naturalLevel: section.naturalLevel ?? null,
      parentKey: section.parentKey ?? null,
      title: section.title
    }))
  };
  return {
    sourceHash: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    version: READWISE_API_EPUB_PROJECTION_VERSION
  };
}

export function matchesReadwiseApiEpubProjection(
  actual: ReadwiseApiEpubProjectionProof | null,
  document: PreparedReadwiseApiDocument
) {
  const expected = createReadwiseApiEpubProjectionProof(document);
  return Boolean(expected && actual
    && actual.version === expected.version
    && actual.sourceHash === expected.sourceHash);
}

export function requiresReadwiseApiEpubProjection(
  actual: ReadwiseApiEpubProjectionProof | null,
  document: PreparedReadwiseApiDocument,
  hasPersistedStructure: boolean
) {
  return document.category === 'epub'
    && Boolean(document.epubStructure?.sections.length)
    && (!hasPersistedStructure || !matchesReadwiseApiEpubProjection(actual, document));
}
