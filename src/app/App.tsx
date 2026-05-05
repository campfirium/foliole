import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { useWorkspaceStore } from '../store/workspaceStore';

import { WorkspaceLayout } from './components/WorkspaceLayout';
import {
  applySelectionMarkup,
  getSelectionCommandPayload,
  normalizeContextMenuPosition,
  type SelectionCommandPayload
} from './contextCommands';
import { useDocumentWidthResizer } from './hooks/useDocumentWidthResizer';
import { useListResizer } from './hooks/useListResizer';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const createHighlightNodeFromSelection = useWorkspaceStore((state) => state.createHighlightNodeFromSelection);
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const createQANodeFromSelection = useWorkspaceStore((state) => state.createQANodeFromSelection);
  const documentMaxWidth = useWorkspaceStore((state) => state.layout.documentMaxWidth);
  const listWidth = useWorkspaceStore((state) => state.layout.listWidth);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setNodeViewState = useWorkspaceStore((state) => state.setNodeViewState);
  const setActiveNode = useWorkspaceStore((state) => state.setActiveNode);
  const setDocumentMaxWidth = useWorkspaceStore((state) => state.setDocumentMaxWidth);
  const setListWidth = useWorkspaceStore((state) => state.setListWidth);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const updateNodeReveal = useWorkspaceStore((state) => state.updateNodeReveal);
  const editorRef = useRef<EditorAdapter | null>(null);
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);

  const listResize = useListResizer(listWidth, setListWidth);
  const documentResize = useDocumentWidthResizer(documentMaxWidth, setDocumentMaxWidth);
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const editorContent = activeNode?.content ?? '';
  const activeNodeViewState = activeNodeId ? nodeViewById[activeNodeId] : undefined;

  const saveActiveNodeView = useCallback(() => {
    if (!activeNodeId || !editorRef.current) {
      return;
    }

    setNodeViewState(activeNodeId, {
      scrollTop: editorRef.current.getScrollTop(),
      selection: editorRef.current.getSelection()
    });
  }, [activeNodeId, setNodeViewState]);

  const handleEditorChange = (content: string) => {
    if (!activeNode) {
      createRootNode(content);
      return;
    }
    updateNodeContent(activeNode.id, content);
  };

  const handleEditorReady = (adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  };

  const handleAnswerChange = (answer: string) => {
    if (!activeNodeId) {
      return;
    }
    updateNodeReveal(activeNodeId, answer);
  };

  const handleSelectNode = (nodeId: string) => {
    setContextMenu(null);
    saveActiveNodeView();
    setActiveNode(nodeId);
  };

  const handleEditorContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!activeNodeId || !activeNode) {
      return;
    }

    const commandPayload = getSelectionCommandPayload(activeNodeId, editorRef.current);
    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    setContextMenu({
      canRunCommands: !!commandPayload,
      left: position.left,
      payload: commandPayload,
      top: position.top
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const syncActiveNodeContentFromEditor = () => {
    if (!activeNodeId || !editorRef.current) {
      return;
    }
    updateNodeContent(activeNodeId, editorRef.current.getContent());
  };

  const handleCreateHighlight = () => {
    const payload = contextMenu?.payload;
    if (!payload) {
      return;
    }
    createHighlightNodeFromSelection(payload.parentNodeId, payload.selectionText);
    if (applySelectionMarkup(editorRef.current, 'highlight')) {
      syncActiveNodeContentFromEditor();
    }
    closeContextMenu();
  };

  const handleCreateCloze = () => {
    const payload = contextMenu?.payload;
    if (!payload) {
      return;
    }
    const childNodeId = createQANodeFromSelection(payload.parentNodeId, payload.clozeContent, payload.selectionText);
    if (childNodeId && applySelectionMarkup(editorRef.current, 'cloze')) {
      syncActiveNodeContentFromEditor();
    }
    closeContextMenu();
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveActiveNodeView();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveActiveNodeView();
    };
  }, [saveActiveNodeView]);

  useEffect(() => {
    const disableNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', disableNativeContextMenu);
    return () => {
      window.removeEventListener('contextmenu', disableNativeContextMenu);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <WorkspaceLayout
      activeNodeId={activeNodeId}
      contextMenu={contextMenu ? { canRunCommands: contextMenu.canRunCommands, left: contextMenu.left, top: contextMenu.top } : null}
      documentMaxWidth={documentMaxWidth}
      editorContent={editorContent}
      editorNodeId={activeNodeId}
      editorNodeViewState={activeNodeViewState}
      isDocumentResizing={documentResize.isResizingDocument}
      isResizingList={listResize.isResizingList}
      listWidth={listWidth}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onCloseContextMenu={closeContextMenu}
      onCreateHighlight={handleCreateHighlight}
      onCreateCloze={handleCreateCloze}
      onAnswerChange={handleAnswerChange}
      onEditorChange={handleEditorChange}
      onEditorContextMenu={handleEditorContextMenu}
      onEditorReady={handleEditorReady}
      onResetLayout={resetLayout}
      onStartDocumentResize={documentResize.startResize}
      onSelectNode={handleSelectNode}
      onSplitterKeyDown={listResize.handleSplitterKeyDown}
      onSplitterPointerDown={listResize.handleSplitterPointerDown}
    />
  );
}

interface EditorContextMenuState {
  canRunCommands: boolean;
  left: number;
  payload: SelectionCommandPayload | null;
  top: number;
}
