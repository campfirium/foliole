import { onNativeKeydown } from '../../shared/platform/keyboard';
import { useWorkspaceStore } from '../../store/workspaceStore';

/** Persistence may finish later; only the still-current creation intent may move focus. */
export async function runNodeCreationWithEditorFocus(args: {
  create: () => Promise<string | null>;
  focus: () => void;
  prepareFocus?: () => boolean;
}) {
  const scope = useWorkspaceStore.getState().libraryScope;
  let cancelled = false;
  let selectedNode: string | null | undefined;
  const cleanup = () => {
    window.removeEventListener('keydown', cancel, true);
    window.removeEventListener('pointerdown', cancel, true);
    window.removeEventListener('blur', cancel);
    unlistenNative();
    unsubscribeStore();
  };
  const cancel = () => { cancelled = true; cleanup(); };
  const isCurrent = (nodeId: string) => {
    const state = useWorkspaceStore.getState();
    return !cancelled && state.libraryScope === scope && state.activeNodeId === nodeId;
  };
  const unlistenNative = onNativeKeydown(input => { if (input.type === 'keyDown') cancel(); });
  const unsubscribeStore = useWorkspaceStore.subscribe((state, previous) => {
    if (state.libraryScope !== scope) cancel();
    else if (state.activeNodeId !== previous.activeNodeId) {
      if (selectedNode !== undefined) cancel();
      else selectedNode = state.activeNodeId;
    }
  });
  window.addEventListener('keydown', cancel, true);
  window.addEventListener('pointerdown', cancel, true);
  window.addEventListener('blur', cancel);
  let deferred = false;
  try {
    const nodeId = await args.create();
    if (!nodeId || !isCurrent(nodeId)) return nodeId;
    if (args.prepareFocus?.()) {
      deferred = true;
      window.requestAnimationFrame(() => {
        try { if (isCurrent(nodeId)) args.focus(); }
        finally { cleanup(); }
      });
    } else args.focus();
    return nodeId;
  } finally {
    if (!deferred) cleanup();
  }
}
