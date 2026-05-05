import { markSelectionComputation } from '../../shared/platform/performanceDiagnosticsProbe';

export function measureSelectionComputation<T>(
  activeNodeId: string | null,
  nodeCount: number,
  key: string,
  compute: () => T
) {
  const startedAt = performance.now();
  const result = compute();
  if (activeNodeId) {
    markSelectionComputation(activeNodeId, key, performance.now() - startedAt, `nodes:${nodeCount}`);
  }
  return result;
}
