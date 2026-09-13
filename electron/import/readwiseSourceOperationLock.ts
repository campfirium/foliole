const runningNodeIds = new Set<string>();

export function isReadwiseSourceOperationRunning(nodeId: string) {
  return runningNodeIds.has(nodeId);
}

export function beginReadwiseSourceOperation(nodeId: string) {
  if (runningNodeIds.has(nodeId)) return false;
  runningNodeIds.add(nodeId);
  return true;
}

export function finishReadwiseSourceOperation(nodeId: string) {
  runningNodeIds.delete(nodeId);
}
