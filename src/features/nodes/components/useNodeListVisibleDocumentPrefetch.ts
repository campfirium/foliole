import { useEffect } from 'react';
import type { RefObject } from 'react';

import {
  requestWorkspaceNodeDocumentPreload,
  setVisibleWorkspaceNodeDocumentPrefetchIds
} from '../../../store/workspaceNodeDocumentPrefetch';
import type { NodeTreeRow } from '../model/nodeTree';

function collectVisibleTreeItemNodeIds(container: HTMLDivElement) {
  const containerRect = container.getBoundingClientRect();
  return Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"][data-node-id]'))
    .filter((item) => {
      const itemRect = item.getBoundingClientRect();
      return itemRect.bottom >= containerRect.top && itemRect.top <= containerRect.bottom;
    })
    .map((item) => item.dataset.nodeId ?? '')
    .filter(Boolean);
}

export function useNodeListVisibleDocumentPrefetch(args: {
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (args.isTrashViewOpen || args.isVirtualViewOpen || args.activeRows.length === 0) {
      setVisibleWorkspaceNodeDocumentPrefetchIds([]);
      return;
    }

    const container = args.scrollContainerRef.current;
    if (!container) {
      return;
    }

    let frame = 0;
    const scheduleUpdate = () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setVisibleWorkspaceNodeDocumentPrefetchIds(collectVisibleTreeItemNodeIds(container));
        requestWorkspaceNodeDocumentPreload();
      });
    };

    scheduleUpdate();
    container.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      container.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [args.activeNodeId, args.activeRows, args.isTrashViewOpen, args.isVirtualViewOpen, args.scrollContainerRef]);
}
