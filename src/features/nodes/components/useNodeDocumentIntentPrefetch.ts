import { useEffect } from 'react';
import type { RefObject } from 'react';

import { requestWorkspaceNodeDocumentPreload } from '../../../store/workspaceNodeDocumentPrefetch';

const NODE_DOCUMENT_INTENT_DELAY_MS = 200;

type NodeDocumentIntentPrefetchArgs = {
  automaticNodeId?: string | null;
  disabled?: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
};

function findTreeItem(container: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }
  const treeItem = target.closest<HTMLElement>('[role="treeitem"][data-node-id]');
  return treeItem && container.contains(treeItem) ? treeItem : null;
}

function startNodeDocumentIntentPrefetch(args: NodeDocumentIntentPrefetchArgs) {
  if (args.disabled) {
    return;
  }
  if (args.automaticNodeId) {
    requestWorkspaceNodeDocumentPreload([args.automaticNodeId]);
  }

  const container = args.scrollContainerRef.current;
  if (!container) {
    return;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingNodeId: string | null = null;
  const cancelPendingIntent = () => {
    if (timer !== null) {
      globalThis.clearTimeout(timer);
      timer = null;
    }
    pendingNodeId = null;
  };
  const scheduleIntent = (event: Event) => {
    const nodeId = findTreeItem(container, event.target)?.dataset.nodeId;
    if (!nodeId || (timer !== null && pendingNodeId === nodeId)) {
      return;
    }
    cancelPendingIntent();
    pendingNodeId = nodeId;
    timer = globalThis.setTimeout(() => {
      timer = null;
      pendingNodeId = null;
      requestWorkspaceNodeDocumentPreload([nodeId]);
    }, NODE_DOCUMENT_INTENT_DELAY_MS);
  };
  const cancelDepartedIntent = (event: Event) => {
    const currentNodeId = findTreeItem(container, event.target)?.dataset.nodeId;
    const nextNodeId = findTreeItem(container, (event as FocusEvent).relatedTarget)?.dataset.nodeId;
    if (!currentNodeId || currentNodeId !== nextNodeId) {
      cancelPendingIntent();
    }
  };

  container.addEventListener('focusin', scheduleIntent);
  container.addEventListener('focusout', cancelDepartedIntent);
  container.addEventListener('pointerover', scheduleIntent);
  container.addEventListener('pointerout', cancelDepartedIntent);
  return () => {
    cancelPendingIntent();
    container.removeEventListener('focusin', scheduleIntent);
    container.removeEventListener('focusout', cancelDepartedIntent);
    container.removeEventListener('pointerover', scheduleIntent);
    container.removeEventListener('pointerout', cancelDepartedIntent);
  };
}

export function useNodeDocumentIntentPrefetch(args: NodeDocumentIntentPrefetchArgs) {
  useEffect(() => startNodeDocumentIntentPrefetch(args), [args.automaticNodeId, args.disabled, args.scrollContainerRef]);
}
