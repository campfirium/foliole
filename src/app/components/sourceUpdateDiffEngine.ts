import { Chunk, type DiffConfig } from '@codemirror/merge';
import { ChangeSet, Text } from '@codemirror/state';

const SOURCE_UPDATE_DIFF_CONFIG: DiffConfig = {
  scanLimit: 5_000,
  timeout: 100
};

export interface SourceUpdateDiffSnapshot {
  chunks: readonly Chunk[];
  currentDoc: Text;
  updatedDoc: Text;
}

function createText(content: string) {
  return Text.of(content.split('\n'));
}

function findCommonPrefix(previous: string, next: string) {
  const limit = Math.min(previous.length, next.length);
  let index = 0;
  while (index < limit && previous.charCodeAt(index) === next.charCodeAt(index)) index += 1;
  return index;
}

function findCommonSuffix(previous: string, next: string, prefix: number) {
  const limit = Math.min(previous.length, next.length) - prefix;
  let length = 0;
  while (
    length < limit
    && previous.charCodeAt(previous.length - length - 1) === next.charCodeAt(next.length - length - 1)
  ) length += 1;
  return length;
}

function createContiguousChange(previous: string, next: string) {
  const prefix = findCommonPrefix(previous, next);
  const suffix = findCommonSuffix(previous, next, prefix);
  return ChangeSet.of({
    from: prefix,
    insert: next.slice(prefix, next.length - suffix),
    to: previous.length - suffix
  }, previous.length);
}

export function createSourceUpdateDiffSnapshot(currentContent: string, updatedContent: string): SourceUpdateDiffSnapshot {
  const currentDoc = createText(currentContent);
  const updatedDoc = createText(updatedContent);
  return {
    chunks: Chunk.build(currentDoc, updatedDoc, SOURCE_UPDATE_DIFF_CONFIG),
    currentDoc,
    updatedDoc
  };
}

export function updateSourceUpdateDiffSnapshot(
  previous: SourceUpdateDiffSnapshot | null,
  currentContent: string,
  updatedContent: string
): SourceUpdateDiffSnapshot {
  if (!previous) return createSourceUpdateDiffSnapshot(currentContent, updatedContent);

  let chunks = previous.chunks;
  let currentDoc = previous.currentDoc;
  let updatedDoc = previous.updatedDoc;
  const previousCurrentContent = currentDoc.toString();
  const previousUpdatedContent = updatedDoc.toString();

  if (previousCurrentContent !== currentContent) {
    const changes = createContiguousChange(previousCurrentContent, currentContent);
    currentDoc = changes.apply(currentDoc);
    chunks = Chunk.updateA(chunks, currentDoc, updatedDoc, changes, SOURCE_UPDATE_DIFF_CONFIG);
  }
  if (previousUpdatedContent !== updatedContent) {
    const changes = createContiguousChange(previousUpdatedContent, updatedContent);
    updatedDoc = changes.apply(updatedDoc);
    chunks = Chunk.updateB(chunks, currentDoc, updatedDoc, changes, SOURCE_UPDATE_DIFF_CONFIG);
  }

  return { chunks, currentDoc, updatedDoc };
}
