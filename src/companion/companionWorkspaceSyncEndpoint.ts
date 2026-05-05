import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

export function resolveCompanionWorkspaceSyncEndpoint(state: NativeCompanionWorkspaceSyncState) {
  return state.endpoint_url ?? state.remembered_targets[0] ?? null;
}
