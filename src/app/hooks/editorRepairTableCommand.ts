import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { resolveMarkdownTableRepair } from '../../features/editor/model/markdownTableRepair';
import type { SelectionCommandPayload } from '../contextCommands';

export function selectionFromRepairPayload(payload: SelectionCommandPayload | null) {
  if (!payload || payload.entries.length === 0) return null;
  return {
    from: Math.min(...payload.entries.map((entry) => entry.range.from)),
    to: Math.max(...payload.entries.map((entry) => entry.range.to))
  };
}

export function resolveEditorRepairTableEdit(
  editor: EditorAdapter | null,
  selection?: EditorSelection | null
) {
  if (!editor) return null;
  return resolveMarkdownTableRepair(editor.getContent(), selection ?? editor.getSelection());
}

export function repairEditorTable(args: {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  selection?: EditorSelection | null;
  updateNodeContent: (nodeId: string, content: string) => Promise<boolean>;
}) {
  const editor = args.editorRef.current;
  const edit = resolveEditorRepairTableEdit(editor, args.selection);
  if (!editor || !edit || !args.activeNodeId) return false;
  editor.replaceRange(edit.from, edit.to, edit.content);
  args.updateNodeContent(args.activeNodeId, editor.getContent());
  return true;
}
