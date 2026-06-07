import { Suspense, lazy } from 'react';

import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';

function loadWorkspaceSettingsOverlayContent() {
  return import('./WorkspaceSettingsOverlayContent');
}

const WorkspaceSettingsOverlayContent = lazy(() =>
  loadWorkspaceSettingsOverlayContent().then((module) => ({ default: module.WorkspaceSettingsOverlayContent }))
);

let workspaceSettingsOverlayPrewarm: Promise<void> | null = null;

export function prewarmWorkspaceSettingsOverlay() {
  workspaceSettingsOverlayPrewarm ??= loadWorkspaceSettingsOverlayContent()
    .then((module) => module.prewarmWorkspaceSettingsOverlayContent())
    .catch(() => undefined);
  return workspaceSettingsOverlayPrewarm;
}

export interface WorkspaceSettingsOverlayProps {
  isSettingsOpen: boolean;
  onClose: () => void;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  requestedCategory: SettingsCategoryId | null;
}

interface WorkspaceSettingsOverlaySource {
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  onRunRailAction?: ((commandId: string) => void) | undefined;
  requestedSettingsCategory: SettingsCategoryId | null;
}

export function selectWorkspaceSettingsOverlayProps(
  props: WorkspaceSettingsOverlaySource
): WorkspaceSettingsOverlayProps {
  return {
    isSettingsOpen: props.isSettingsOpen,
    onClose: props.onCloseSettings,
    onRunSupportCommand: props.onRunRailAction,
    requestedCategory: props.requestedSettingsCategory
  };
}

export function WorkspaceSettingsOverlay({
  isSettingsOpen,
  onClose,
  onRunSupportCommand,
  requestedCategory
}: WorkspaceSettingsOverlayProps) {
  if (!isSettingsOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <WorkspaceSettingsOverlayContent
        onClose={onClose}
        onRunSupportCommand={onRunSupportCommand}
        requestedCategory={requestedCategory}
      />
    </Suspense>
  );
}
