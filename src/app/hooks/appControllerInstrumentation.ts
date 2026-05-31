import { markSelectionComputation } from '../../shared/platform/performanceDiagnosticsProbe';
import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic
} from '../../store/workspaceEditorInputDiagnostics';

export function measureSelectionComputation<T>(
  activeNodeId: string | null,
  nodeCount: number,
  key: string,
  compute: () => T
) {
  const startedAt = performance.now();
  const result = compute();
  const totalMs = performance.now() - startedAt;
  if (activeNodeId) {
    markSelectionComputation(activeNodeId, key, totalMs, `nodes:${nodeCount}`);
  }
  if (isEditorInputDiagnosticEnabled()) {
    logEditorInputDiagnostic('app-controller-selection-computation', {
      activeNodeId,
      key,
      nodeCount,
      totalMs
    });
  }
  return result;
}
