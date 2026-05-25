import { useEffect, useState } from 'react';

import { isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import { onWindowEscape, onWindowKeydown } from '../../shared/platform/keyboard';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { blurActiveKeyboardTarget, isEditableKeyboardTarget } from './workspaceKeyboardTarget';

export function useCurrentNodeKeyboardShortcuts(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  isStudyMode: boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const blocked = isCurrentNodeKeyboardBlocked(args);
  const [isEditing, setIsEditing] = useCurrentNodeEditingState(blocked);
  useCurrentNodeEditingEscape(blocked, isEditing, setIsEditing);
  useCurrentNodeDeleteShortcut(args, blocked, isEditing);
}

function isCurrentNodeKeyboardBlocked(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  isStudyMode: boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const runtime = args.controller.runtime;
  return (
    args.isStudyMode ||
    Boolean(args.controller.editorCtx.contextMenu) ||
    runtime.isCommandPaletteOpen ||
    runtime.isSearchPaletteOpen ||
    runtime.isSettingsOpen ||
    runtime.isGoToNodePaletteOpen ||
    runtime.isMoveToNodePaletteOpen ||
    runtime.isViewingTrashNode ||
    args.controller.trash.isTrashViewOpen ||
    args.controller.virtualView.isVirtualViewOpen ||
    args.controller.externalView.isExternalViewOpen ||
    !args.ws.activeNodeId
  );
}

function useCurrentNodeEditingState(blocked: boolean) {
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    if (blocked) {
      setIsEditing(false);
      return;
    }
    const syncEditingState = (target: EventTarget | null) => setIsEditing(isEditableKeyboardTarget(target));
    syncEditingState(document.activeElement);
    const handleFocusIn = (event: FocusEvent) => syncEditingState(event.target);
    const handleFocus = (event: FocusEvent) => syncEditingState(event.target);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focus', handleFocus, true);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focus', handleFocus, true);
    };
  }, [blocked]);
  return [isEditing, setIsEditing] as const;
}

function useCurrentNodeEditingEscape(
  blocked: boolean,
  isEditing: boolean,
  setIsEditing: (value: boolean) => void
) {
  useEffect(() => {
    if (blocked || !isEditing) {
      return undefined;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      blurActiveKeyboardTarget();
      setIsEditing(false);
      event.preventDefault();
      event.stopPropagation();
    };
    return onWindowEscape(handleEscape);
  }, [blocked, isEditing, setIsEditing]);
}

function useCurrentNodeDeleteShortcut(
  args: {
    controller: ReturnType<typeof useWorkspaceControllerState>;
    ws: ReturnType<typeof useWorkspaceSelectors>;
  },
  blocked: boolean,
  isEditing: boolean
) {
  useEffect(() => {
    if (blocked) {
      return undefined;
    }
    return onWindowKeydown((event) => {
      if (!isCurrentNodeDeleteEvent(event) || isEditing || isEditableKeyboardTarget(event.target) || isEditableKeyboardTarget(document.activeElement)) {
        return;
      }
      const nodeId = args.ws.activeNodeId;
      const node = nodeId ? args.ws.nodesById[nodeId] : null;
      if (!nodeId || !node || isProtectedRootNode(node)) {
        return;
      }
      event.preventDefault();
      args.ws.deleteNode(nodeId);
    });
  }, [args.ws, blocked, isEditing]);
}

function isCurrentNodeDeleteEvent(event: KeyboardEvent) {
  return (
    event.key === 'Delete' &&
    !event.defaultPrevented &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.repeat
  );
}
