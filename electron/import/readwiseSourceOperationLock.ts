const runningOperations = new Map<string, AbortController | undefined>();

export function isReadwiseSourceOperationRunning(nodeId: string) {
  return runningOperations.has(nodeId);
}

export function beginReadwiseSourceOperation(nodeId: string, controller?: AbortController) {
  if (runningOperations.has(nodeId)) return false;
  runningOperations.set(nodeId, controller);
  return true;
}

export function finishReadwiseSourceOperation(nodeId: string) {
  runningOperations.delete(nodeId);
}

export function cancelReadwiseSourceOperations() {
  for (const controller of runningOperations.values()) controller?.abort();
}
