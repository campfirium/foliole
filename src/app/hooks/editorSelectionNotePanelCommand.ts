import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getSelectionCommandPayload } from '../contextCommands';

import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

function resolveKeyboardToolbarPosition() {
  const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  const anchorLeft = rect && rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const anchorTop = rect && rect.height > 0 ? rect.top : window.innerHeight / 3;
  const toolbarWidth = 150;
  const notePanelWidth = 240;
  return {
    left: Math.max(8, Math.min(anchorLeft - 22, window.innerWidth - toolbarWidth - 8)),
    notePanelLeft: Math.max(8, Math.min(anchorLeft - notePanelWidth / 2, window.innerWidth - notePanelWidth - 8)),
    notePanelTop: Math.max(8, (rect?.bottom ?? anchorTop) + 8),
    top: Math.max(8, anchorTop - 46)
  };
}

export function createOpenSelectionNotePanel(args: {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  setContextMenu: (value: EditorContextMenuState | null) => void;
}) {
  return () => {
    if (!args.activeNodeId) {
      return;
    }
    const payload = getSelectionCommandPayload(args.activeNodeId, args.editorRef.current);
    if (!payload) {
      return;
    }
    args.setContextMenu({
      ...resolveKeyboardToolbarPosition(),
      canRunCommands: true,
      initialNoteOpen: true,
      kind: 'selection',
      mode: 'annotation-toolbar',
      payload
    });
  };
}
