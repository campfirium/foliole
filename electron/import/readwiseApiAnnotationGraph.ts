import type { ReadwiseAnnotationLedgerFact } from '../database/readwiseApiIndexStage.js';

export function indexReadwiseApiAnnotationGraph(
  facts: ReadwiseAnnotationLedgerFact[],
  runStartedAt: string
) {
  const highlights = facts.filter((item) => item.category === 'highlight');
  const highlightById = new Map(highlights.map((item) => [item.remoteId, item]));
  const highlightIdsByParent = new Map<string, string[]>();
  const currentHighlightIdsByParent = new Map<string, string[]>();
  const noteIdsByParent = new Map<string, string[]>();
  const affectedParents = new Set<string>();
  for (const highlight of highlights) {
    if (!highlight.parentId) {
      if (highlight.seenInRun === runStartedAt) throw unresolved(highlight.remoteId);
      continue;
    }
    append(highlightIdsByParent, highlight.parentId, highlight.remoteId);
    if (highlight.seenInRun === runStartedAt) {
      affectedParents.add(highlight.parentId);
      append(currentHighlightIdsByParent, highlight.parentId, highlight.remoteId);
    }
  }
  for (const note of facts.filter((item) => item.category === 'note')) {
    const highlight = note.parentId ? highlightById.get(note.parentId) : null;
    const documentId = highlight?.parentId ?? highlight?.documentId ?? null;
    if (!documentId) {
      if (note.seenInRun === runStartedAt) throw unresolved(note.remoteId);
      continue;
    }
    if (note.seenInRun === runStartedAt) append(noteIdsByParent, documentId, note.remoteId);
    if (note.seenInRun === runStartedAt) affectedParents.add(documentId);
  }
  return {
    affectedParents,
    currentHighlightIdsByParent,
    highlightedParents: new Set(highlightIdsByParent.keys()),
    highlightIdsByParent,
    noteIdsByParent
  };
}

function append(target: Map<string, string[]>, key: string, value: string) {
  target.set(key, [...(target.get(key) ?? []), value]);
}

function unresolved(remoteId: string) {
  return new Error(`readwise_api_annotation_parent_unresolved:${remoteId}`);
}
