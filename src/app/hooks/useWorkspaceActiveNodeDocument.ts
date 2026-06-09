import { useEffect } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import {
  beginNodeSelectionFlow,
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted
} from '../../shared/platform/performanceDiagnosticsProbe';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { getNodeDocumentStatus, isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface UseWorkspaceActiveNodeDocumentOptions {
  includeTrashed?: boolean;
  keepWarm?: boolean;
}

export function useWorkspaceActiveNodeDocument(
  activeNodeId: string | null,
  options: UseWorkspaceActiveNodeDocumentOptions = {}
) {
  const activeNodeDocumentStatus = useWorkspaceStore((state) =>
    activeNodeId ? getNodeDocumentStatus(state.nodesById[activeNodeId]) : 'missing'
  );

  useEffect(() => {
    if (!hasWorkspaceRuntimeRepository() || !activeNodeId) {
      return;
    }

    const activeNode = useWorkspaceStore.getState().nodesById[activeNodeId];
    beginNodeSelectionFlow(activeNodeId, useWorkspaceStore.getState().nodesById);
    if (!activeNode || isNodeDocumentLoaded(activeNode)) {
      markNodeDocumentLoadResolved(activeNodeId);
      return;
    }

    let cancelled = false;
    void ensureWorkspaceNodeDocumentReady(activeNodeId, {
      onDocumentMerged: (document) => {
        if (!cancelled) {
          markNodeDocumentMerged(activeNodeId, `content:${document.content.length}`);
        }
      },
      onLoadResolved: () => {
        if (!cancelled) {
          markNodeDocumentLoadResolved(activeNodeId);
        }
      },
      onLoadStarted: () => {
        if (!cancelled) {
          markNodeDocumentLoadStarted(activeNodeId);
        }
      },
      ...definedProps({ includeTrashed: options.includeTrashed, keepWarm: options.keepWarm })
    });

    return () => {
      cancelled = true;
    };
  }, [activeNodeDocumentStatus, activeNodeId, options.includeTrashed, options.keepWarm]);
}
