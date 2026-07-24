import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import { requestFoliolePublishedDelete } from '../../shared/platform/foliolePublishedManagement';
import { onNativeEditingEscape, onWindowEscape, onWindowKeydown } from '../../shared/platform/keyboard';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { blurActiveKeyboardTarget, isEditableKeyboardTarget } from './workspaceKeyboardTarget';

export function useCurrentNodeKeyboardShortcuts(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  isStudyMode: boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const editingDisabled = isCurrentNodeEditingDisabled(args);
  const transientSurfaceOpen = isCurrentNodeTransientSurfaceOpen(args.controller);
  const shortcutsBlocked = isCurrentNodeKeyboardBlocked(args);
  const editingContextRef = useRef(false);
  const [isEditing, setIsEditing] = useCurrentNodeEditingState(editingDisabled, editingContextRef);
  useCurrentNodeEditingEscape(editingDisabled, transientSurfaceOpen, editingContextRef, setIsEditing);
  useCurrentNodeDeleteShortcut(args, shortcutsBlocked, isEditing);
}

function isCurrentNodeEditingDisabled(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  isStudyMode: boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const runtime = args.controller.runtime;
  return (
    args.isStudyMode ||
    runtime.isViewingTrashNode ||
    args.controller.trash.isTrashViewOpen ||
    args.controller.virtualView.isVirtualViewOpen ||
    args.controller.externalView.isExternalViewOpen ||
    !args.ws.activeNodeId
  );
}

function isCurrentNodeKeyboardBlocked(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  isStudyMode: boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return (
    isCurrentNodeEditingDisabled(args) ||
    isCurrentNodeTransientSurfaceOpen(args.controller)
  );
}

function isCurrentNodeTransientSurfaceOpen(controller: ReturnType<typeof useWorkspaceControllerState>) {
  const runtime = controller.runtime;
  return (
    Boolean(controller.editorCtx.contextMenu) ||
    runtime.isCommandPaletteOpen ||
    runtime.isSearchPaletteOpen ||
    runtime.isSettingsOpen ||
    runtime.isGoToNodePaletteOpen ||
    runtime.isMoveToNodePaletteOpen
  );
}

function useCurrentNodeEditingState(blocked: boolean, editingContextRef: MutableRefObject<boolean>) {
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    if (blocked) {
      editingContextRef.current = false;
      setIsEditing(false);
      return;
    }
    const syncEditingState = (target: EventTarget | null) => {
      if (target instanceof HTMLElement && target.closest('[role="dialog"]')) {
        return;
      }
      const nextIsEditing = isEditableKeyboardTarget(target);
      editingContextRef.current = nextIsEditing;
      setIsEditing(nextIsEditing);
    };
    syncEditingState(document.activeElement);
    const handleFocusIn = (event: FocusEvent) => syncEditingState(event.target);
    const handleFocus = (event: FocusEvent) => syncEditingState(event.target);
    const handleFocusOut = () => {
      window.setTimeout(() => syncEditingState(document.activeElement), 0);
    };
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focus', handleFocus, true);
    window.addEventListener('focusout', handleFocusOut);
    window.addEventListener('blur', handleFocusOut, true);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('blur', handleFocusOut, true);
    };
  }, [blocked, editingContextRef]);
  return [isEditing, setIsEditing] as const;
}

function useCurrentNodeEditingEscape(
  blocked: boolean,
  transientSurfaceOpen: boolean,
  editingContextRef: MutableRefObject<boolean>,
  setIsEditing: (value: boolean) => void
) {
  useEffect(() => {
    if (blocked) {
      return undefined;
    }
    const exitEditing = () => {
      blurActiveKeyboardTarget();
      editingContextRef.current = false;
      setIsEditing(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (transientSurfaceOpen || document.querySelector('[role="dialog"]')) return false;
      if (!editingContextRef.current && !isEditableKeyboardTarget(document.activeElement)) return false;
      exitEditing();
    };
    const unlistenEscape = onWindowEscape(handleEscape);
    const unlistenNativeFallback = onNativeEditingEscape({
      exitEditing,
      isDialogOpen: () => transientSurfaceOpen || Boolean(document.querySelector('[role="dialog"]')),
      isEditing: () => editingContextRef.current || isEditableKeyboardTarget(document.activeElement)
    });
    return () => {
      unlistenEscape();
      unlistenNativeFallback();
    };
  }, [blocked, editingContextRef, setIsEditing, transientSurfaceOpen]);
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
      requestFoliolePublishedDelete({ nodeIds: [nodeId], onAllowed: () => args.ws.deleteNode(nodeId) });
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
