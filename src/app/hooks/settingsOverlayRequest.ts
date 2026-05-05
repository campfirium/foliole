import type { useWorkspaceControllerState } from './appControllerState';

type AppRuntime = ReturnType<typeof useWorkspaceControllerState>['runtime'];

export function clearSettingsRequest(runtime: AppRuntime) {
  runtime.setRequestedSettingsCategory(null);
  runtime.setRequestedSettingsDialog(null);
}

export function createOpenSettingsHandler(runtime: AppRuntime) {
  return () => {
    clearSettingsRequest(runtime);
    runtime.setIsSettingsOpen(true);
  };
}

export function createCloseSettingsHandler(runtime: AppRuntime) {
  return () => {
    runtime.setIsSettingsOpen(false);
    clearSettingsRequest(runtime);
  };
}

export function openReadwiseReaderSettings(runtime: AppRuntime) {
  runtime.setRequestedSettingsCategory('import');
  runtime.setRequestedSettingsDialog('readwise-reader');
  runtime.setIsSettingsOpen(true);
}
