import { useEffect, useState } from 'react';

import type { Node } from '../../../features/nodes/model/nodeTypes';
import { isRuntimeInvokeAvailable } from '../runtimeInvoke';

import { loadWorkspaceNodeLearning, type WorkspaceNodeLearning } from './workspaceNodeLearningRepository';

/** A mounted inspector's result, released on target/library change or unmount. */
export function useWorkspaceNodeLearning(node: Node | undefined, libraryScope: string | undefined): Node | null {
  const native = isRuntimeInvokeAvailable();
  const [result, setResult] = useState<{
    source: Node; scope: string; learning: WorkspaceNodeLearning | null;
  } | null>(null);
  useEffect(() => {
    if (!native || !node || !libraryScope) return;
    let disposed = false;
    setResult(null);
    void loadWorkspaceNodeLearning(node.id, libraryScope).then(learning => {
      if (!disposed) setResult({ source: node, scope: libraryScope, learning });
    }).catch(() => { if (!disposed) setResult(null); });
    return () => { disposed = true; };
  }, [node, libraryScope, native]);
  // The browser demo owns its facts in its saved envelope, rather than a native database.
  if (!native) return node ?? null;
  return node && result && result.source === node && result.scope === libraryScope && result.learning
    ? { ...node, ...result.learning } : null;
}
