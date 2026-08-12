import { randomUUID } from 'node:crypto';

const runtimeInstanceId = randomUUID();

export function loadSyncGroupRuntimeInstanceId() {
  return runtimeInstanceId;
}
