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
  runtime.setRequestedSettingsCategory('readwise-reader');
  runtime.setRequestedSettingsDialog('readwise-reader');
  runtime.setIsSettingsOpen(true);
}

export function openExternalLibrarySettings(runtime: AppRuntime) {
  runtime.setRequestedSettingsDialog(null);
  runtime.setRequestedSettingsCategory('external-search');
  runtime.setIsSettingsOpen(true);
}

export function openCompanionSyncSettings(runtime: AppRuntime) {
  runtime.setRequestedSettingsDialog(null);
  runtime.setRequestedSettingsCategory('companion-sync');
  runtime.setIsSettingsOpen(true);
}

export function openDiscoursePublishSettings(runtime: AppRuntime) {
  runtime.setRequestedSettingsDialog(null);
  runtime.setRequestedSettingsCategory('publishing');
  runtime.setIsSettingsOpen(true);
}
