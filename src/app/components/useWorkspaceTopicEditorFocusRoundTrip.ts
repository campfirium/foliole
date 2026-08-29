import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

interface FocusSession {
  adapter: EditorAdapter;
  nodeId: string;
  origin: HTMLButtonElement;
}

interface FocusRoundTripInput {
  activeNodeId: string | null;
  browseRootNodeId: string;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
  editorNodeId: string | null;
  isEditorReadOnly: boolean;
  isExternalViewOpen: boolean;
  isPriorityQuickSetActive: boolean;
  isStudyMode: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  nodesById: WorkspaceListNodesById;
}

export function selectWorkspaceTopicEditorFocusRoundTripInput(
  props: WorkspaceLayoutProps,
  nodesById: WorkspaceListNodesById
): FocusRoundTripInput {
  return {
    activeNodeId: props.navigation.activeNodeId,
    browseRootNodeId: props.nodeList.browseRootNodeId,
    editorAdapterRef: props.document.editorAdapterRef,
    editorNodeId: props.document.editorNodeId,
    isEditorReadOnly: props.document.isEditorReadOnly,
    isExternalViewOpen: props.externalLibrary.isExternalViewOpen,
    isPriorityQuickSetActive: props.document.isPriorityQuickSetActive,
    isStudyMode: props.review.isStudyMode,
    isTrashViewOpen: props.trash.isTrashViewOpen,
    isVirtualViewOpen: props.virtualView.isVirtualViewOpen,
    nodesById
  };
}

function isOrdinaryEditableTopic(args: FocusRoundTripInput, nodeId: string) {
  const node = args.nodesById[nodeId];
  return (
    args.activeNodeId === nodeId &&
    args.editorNodeId === nodeId &&
    node?.kind === 'topic' &&
    !node.anchorLink &&
    !args.isEditorReadOnly &&
    !args.isExternalViewOpen &&
    !args.isPriorityQuickSetActive &&
    !args.isStudyMode &&
    !args.isTrashViewOpen &&
    !args.isVirtualViewOpen
  );
}

function findTopicTreeItem(nodeId: string) {
  const tree = document.querySelector<HTMLElement>('[data-topic-editor-focus-tree="true"]');
  return Array.from(tree?.querySelectorAll<HTMLButtonElement>('[role="treeitem"][data-node-id]') ?? [])
    .find((item) => item.dataset.nodeId === nodeId && item.isConnected) ?? null;
}

function isConnectedTopicTreeItem(item: HTMLButtonElement) {
  return item.isConnected && Boolean(item.closest('[data-topic-editor-focus-tree="true"]'));
}

export function useWorkspaceTopicEditorFocusRoundTrip(args: FocusRoundTripInput) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const sessionRef = useRef<FocusSession | null>(null);
  useEffect(() => {
    sessionRef.current = null;
  }, [
    args.browseRootNodeId,
    args.isEditorReadOnly,
    args.isExternalViewOpen,
    args.isPriorityQuickSetActive,
    args.isStudyMode,
    args.isTrashViewOpen,
    args.isVirtualViewOpen
  ]);

  const focusEditor = useCallback((nodeId: string, origin: HTMLButtonElement) => {
    const current = argsRef.current;
    const adapter = current.editorAdapterRef.current;
    if (!adapter || !isOrdinaryEditableTopic(current, nodeId)) return false;
    sessionRef.current = { adapter, nodeId, origin };
    adapter.focus();
    return true;
  }, []);

  const returnToTopic = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (
      !session ||
      session.adapter !== argsRef.current.editorAdapterRef.current ||
      !argsRef.current.activeNodeId ||
      !isOrdinaryEditableTopic(argsRef.current, argsRef.current.activeNodeId)
    ) return false;
    const exactOrigin = isConnectedTopicTreeItem(session.origin) ? session.origin : findTopicTreeItem(session.nodeId);
    const activeNodeId = argsRef.current.activeNodeId;
    const fallback = exactOrigin ?? (activeNodeId ? findTopicTreeItem(activeNodeId) : null);
    fallback?.focus({ preventScroll: true });
    return Boolean(fallback);
  }, []);

  return { focusEditor, returnToTopic };
}
