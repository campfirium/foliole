import { ChangeSet, Text } from '@codemirror/state';

import { digestEditorContent } from './editorContentDigest';
import type {
  EditorAnnotationOperationEntry,
  EditorOperationSelectionSnapshot,
  EditorTextEditOperationEntry
} from './editorOperationHistory';

function createChanges(beforeContent: string, afterContent: string) {
  let prefix = 0;
  while (prefix < beforeContent.length && beforeContent[prefix] === afterContent[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < beforeContent.length - prefix &&
    suffix < afterContent.length - prefix &&
    beforeContent[beforeContent.length - suffix - 1] === afterContent[afterContent.length - suffix - 1]
  ) suffix += 1;
  return ChangeSet.of({
    from: prefix,
    insert: afterContent.slice(prefix, afterContent.length - suffix),
    to: beforeContent.length - suffix
  }, beforeContent.length);
}

function cursor(position: number): EditorOperationSelectionSnapshot {
  return { mainIndex: 0, ranges: [{ anchor: position, head: position }] };
}

export function createTextHistoryEntry(args: {
  afterContent: string;
  beforeContent: string;
  nodeId?: string;
  selection?: EditorOperationSelectionSnapshot;
  timestamp?: number;
  userEvent?: string;
}): EditorTextEditOperationEntry {
  const forwardChanges = createChanges(args.beforeContent, args.afterContent);
  return {
    afterDigest: digestEditorContent(args.afterContent),
    afterSelection: cursor(args.afterContent.length),
    beforeDigest: digestEditorContent(args.beforeContent),
    beforeSelection: args.selection ?? cursor(args.beforeContent.length),
    forwardChanges,
    inverseChanges: forwardChanges.invert(Text.of(args.beforeContent.split('\n'))),
    nodeId: args.nodeId ?? 'node-1',
    timestamp: args.timestamp ?? 1000,
    title: 'Edit Text',
    type: 'text.edit',
    userEvent: args.userEvent ?? 'input.type'
  };
}

export function applyTextHistoryEntry(
  content: string,
  entry: EditorTextEditOperationEntry,
  mode: 'redo' | 'undo'
) {
  const document = Text.of(content.split('\n'));
  return (mode === 'undo' ? entry.inverseChanges : entry.forwardChanges).apply(document).toString();
}

export function createAnnotationHistoryEntry(
  nodeId: string,
  type: EditorAnnotationOperationEntry['type'],
  canonical: EditorAnnotationOperationEntry['canonical'] = 'confirmed'
): EditorAnnotationOperationEntry {
  const base = {
    annotations: [{
      anchorId: 'anchor-1',
      kind: 'highlight' as const,
      nodeId: 'highlight-1',
      orderIndex: 2,
      parentNodeId: nodeId
    }],
    canonical,
    nodeId
  };
  return type === 'annotation.create'
    ? { ...base, title: 'Create Annotation', type }
    : { ...base, title: 'Delete Annotation', type };
}
