import { useEffect, useState } from 'react';

import type { Node } from '../../../features/nodes/model/nodeTypes';
import type { WorkspaceContentChangedPayload } from '../electronApi';
import { isRuntimeInvokeAvailable } from '../runtimeInvoke';
import { onWorkspaceContentChanged, onWorkspaceSyncApplied } from '../runtimeShellEvents';

import { loadWorkspaceNodeLearning, type WorkspaceNodeLearning } from './workspaceNodeLearningRepository';

/** A mounted inspector's result, released on target/library change or unmount. */
export function useWorkspaceNodeLearning(node: Node | undefined, libraryScope: string | undefined, onError?: (error: unknown) => void, requestKey?: unknown): Node | null {
  const native = isRuntimeInvokeAvailable();
  const nodeId = node?.id;
  const learningKey = JSON.stringify([node?.reading, node?.review, node?.learningSummary]);
  const [result, setResult] = useState<{
    nodeId: string; scope: string; requestKey: unknown; learning: WorkspaceNodeLearning | null;
  } | null>(null);
  useEffect(() => {
    if (!native || !nodeId || !libraryScope) {
      setResult(null);
      if (native && nodeId && !libraryScope) onError?.(new Error('workspace_learning_library_missing'));
      return;
    }
    let disposed = false;
    let generation = 0;
    const unlisteners: (() => void)[] = [];
    const reload = () => {
      const request = ++generation;
      void loadWorkspaceNodeLearning(nodeId, libraryScope).then(learning => {
        if (disposed || request !== generation) return;
        setResult({ nodeId, scope: libraryScope, requestKey, learning });
        if (!learning) onError?.(new Error('workspace_learning_target_missing'));
      }).catch(error => {
        if (disposed || request !== generation) return;
        setResult(null);
        onError?.(error);
      });
    };
    const changed = (payload: Pick<WorkspaceContentChangedPayload, 'libraryScope' | 'workspaceScope'>) => {
      if (disposed) return;
      if (payload.libraryScope && payload.libraryScope !== libraryScope) return;
      const scope = payload.workspaceScope;
      if (!scope || scope.kind === 'full' || scope.readingNodeIds?.includes(nodeId) || scope.reviewNodeIds?.includes(nodeId)) reload();
    };
    reload();
    for (const subscribe of [onWorkspaceContentChanged, onWorkspaceSyncApplied]) {
      void subscribe(changed).then(unlisten => {
        if (disposed) unlisten?.();
        else if (unlisten) unlisteners.push(unlisten);
      });
    }
    return () => { disposed = true; unlisteners.forEach(unlisten => unlisten()); };
  }, [nodeId, learningKey, libraryScope, native, onError, requestKey]);
  // The browser demo owns its facts in its saved envelope, rather than a native database.
  if (!native) return node ?? null;
  return node && result && result.nodeId === node.id && result.scope === libraryScope && result.requestKey === requestKey && result.learning
    ? { ...node, ...result.learning } : null;
}
