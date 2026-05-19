import type { ImportSourceKind } from '../../lib/core/import/contract.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import type { ReadwiseBooksSourceSignature } from './readwiseBooksInventory.js';

type SourceGroup = ReadwiseBooksSourceSignature['entries'][number]['sourceGroup'];

async function discoverSources(rootDir: string, supportedKinds: ImportSourceKind[]) {
  if (!rootDir.trim()) {
    return [];
  }
  try {
    return await discoverDirectoryImportSources(rootDir, { supportedKinds });
  } catch {
    return [];
  }
}

function toSignatureEntry(sourceGroup: SourceGroup, source: DirectoryImportSourceDescriptor) {
  return {
    kind: source.kind,
    mtimeMs: source.mtimeMs,
    sizeBytes: source.sizeBytes,
    sourceGroup,
    sourceName: source.sourceName
  };
}

export function createReadwiseBooksSourceSignature(input: {
  fullDocumentSources: DirectoryImportSourceDescriptor[];
  highlightSources: DirectoryImportSourceDescriptor[];
}): ReadwiseBooksSourceSignature {
  const entries = [
    ...input.fullDocumentSources.map((source) => toSignatureEntry('fullDocument', source)),
    ...input.highlightSources.map((source) => toSignatureEntry('highlight', source))
  ].sort((left, right) =>
    `${left.sourceGroup}\u001f${left.sourceName}\u001f${left.kind}`.localeCompare(
      `${right.sourceGroup}\u001f${right.sourceName}\u001f${right.kind}`
    )
  );
  return { entries, version: 1 };
}

export async function discoverReadwiseBooksSourceSignature(input: {
  fullDocumentDirectoryPath: string;
  highlightDirectoryPath: string;
}) {
  const [highlightSources, fullDocumentSources] = await Promise.all([
    discoverSources(input.highlightDirectoryPath, ['markdown']),
    discoverSources(input.fullDocumentDirectoryPath, ['epub', 'markdown'])
  ]);
  return createReadwiseBooksSourceSignature({ fullDocumentSources, highlightSources });
}

export function areReadwiseBooksSourceSignaturesEqual(
  left: ReadwiseBooksSourceSignature | undefined,
  right: ReadwiseBooksSourceSignature
) {
  return Boolean(left) && JSON.stringify(left) === JSON.stringify(right);
}
