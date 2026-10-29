import { useEffect, useState } from 'react';

import type { Node } from '../../../features/nodes/model/nodeTypes';
import { isRuntimeInvokeAvailable } from '../runtimeInvoke';

import { loadWorkspaceNodeLearning, type WorkspaceNodeLearning } from './workspaceNodeLearningRepository';

/** A mounted inspector's result, released on target/library change or unmount. */
export function useWorkspaceNodeLearning(node: Node | undefined, libraryScope: string | undefined, onError?: (error: unknown) => void, requestKey?: unknown): Node | null {
  const native = isRuntimeInvokeAvailable();
  const [result, setResult] = useState<{
    source: Node; scope: string; requestKey: unknown; learning: WorkspaceNodeLearning | null;
  } | null>(null);
  useEffect(() => {
    if (!native || !node) {
      setResult(null);
      return;
    }
    if (!libraryScope) {
      setResult(null);
      onError?.(new Error('workspace_learning_library_missing'));
      return;
    }
    let disposed = false;
    setResult(null);
    void loadWorkspaceNodeLearning(node.id, libraryScope).then(learning => {
      if (!disposed) {
        setResult({ source: node, scope: libraryScope, requestKey, learning });
        if (!learning) onError?.(new Error('workspace_learning_target_missing'));
      }
    }).catch(error => {
      if (!disposed) {
        setResult(null);
        onError?.(error);
      }
    });
    return () => { disposed = true; };
  }, [node, libraryScope, native, onError, requestKey]);
  // The browser demo owns its facts in its saved envelope, rather than a native database.
  if (!native) return node ?? null;
  return node && result && result.source === node && result.scope === libraryScope && result.requestKey === requestKey && result.learning
    ? { ...node, ...result.learning } : null;
}
