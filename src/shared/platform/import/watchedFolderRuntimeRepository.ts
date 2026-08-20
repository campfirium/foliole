import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeWatchedFolderBinding,
  NativeWatchedFolderBindingsState,
  NativeWatchedFolderMatchPreview
} from '../../../../lib/platform/nativeWatchedFolderContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

function requireInvoke() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('watched_folder_runtime_unavailable');
  return invoke;
}

export function loadWatchedFolderBindingsFromRuntime(): Promise<NativeWatchedFolderBindingsState> {
  const invoke = getRuntimeInvoke();
  return invoke
    ? invoke(NATIVE_COMMANDS.loadWatchedFolderBindings)
    : Promise.resolve({ bindings: [], current_host_name: '' });
}

export function disconnectWatchedFolderInRuntime(bindingId: string): Promise<NativeWatchedFolderBinding> {
  return requireInvoke()(NATIVE_COMMANDS.disconnectWatchedFolder, { binding_id: bindingId });
}

export function removeWatchedFolderInRuntime(bindingId: string): Promise<NativeWatchedFolderBinding[]> {
  return requireInvoke()(NATIVE_COMMANDS.removeWatchedFolder, { binding_id: bindingId });
}

export function previewWatchedFolderReconnectInRuntime(bindingId: string, folderPath: string): Promise<NativeWatchedFolderMatchPreview> {
  return requireInvoke()(NATIVE_COMMANDS.previewWatchedFolderReconnect, {
    binding_id: bindingId, folder_path: folderPath
  });
}

export function confirmWatchedFolderReconnectInRuntime(bindingId: string, folderPath: string): Promise<NativeWatchedFolderMatchPreview> {
  return requireInvoke()(NATIVE_COMMANDS.confirmWatchedFolderReconnect, {
    binding_id: bindingId, folder_path: folderPath
  });
}
