import { cancelReadwiseSourceOperations } from './readwiseSourceOperationLock.js';

let stoppingGroupId: string | null = null;

export function isReadwiseExecutionStopping(groupId?: string | null) {
  return stoppingGroupId !== null && (groupId === undefined || stoppingGroupId === groupId);
}

export function beginReadwiseExecutionStop(groupId: string) {
  stoppingGroupId = groupId;
  cancelReadwiseSourceOperations();
}

export function endReadwiseExecutionStop() {
  stoppingGroupId = null;
}
