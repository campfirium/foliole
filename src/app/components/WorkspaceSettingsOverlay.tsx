import { Suspense, lazy } from 'react';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

function loadWorkspaceSettingsOverlayContent() {
  return import('./WorkspaceSettingsOverlayContent');
}

function loadDemoSettingsPreviewOverlay() {
  return import('../../features/settings/components/DemoSettingsPreviewOverlay');
}

const WorkspaceSettingsOverlayContent = lazy(() =>
  loadWorkspaceSettingsOverlayContent().then((module) => ({ default: module.WorkspaceSettingsOverlayContent }))
);

const DemoSettingsPreviewOverlay = lazy(() =>
  loadDemoSettingsPreviewOverlay().then((module) => ({ default: module.DemoSettingsPreviewOverlay }))
);

const demoImportSettings = createDefaultImportManagerSettings();

let workspaceSettingsOverlayPrewarm: Promise<void> | null = null;

export function prewarmWorkspaceSettingsOverlay(options?: { isDemo?: boolean }) {
  if (options?.isDemo) {
    return Promise.resolve();
  }
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
  requestedRowId?: string | null;
}

interface WorkspaceSettingsOverlaySource {
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  onRunRailAction?: ((commandId: string) => void) | undefined;
  requestedSettingsCategory: SettingsCategoryId | null;
  requestedSettingsRowId: string | null;
}

export function selectWorkspaceSettingsOverlayProps(
  props: WorkspaceSettingsOverlaySource
): WorkspaceSettingsOverlayProps {
  return {
    isSettingsOpen: props.isSettingsOpen,
    onClose: props.onCloseSettings,
    onRunSupportCommand: props.onRunRailAction,
    requestedCategory: props.requestedSettingsCategory,
    requestedRowId: props.requestedSettingsRowId
  };
}

export function WorkspaceSettingsOverlay({
  isSettingsOpen,
  onClose,
  onRunSupportCommand,
  requestedCategory,
  requestedRowId = null
}: WorkspaceSettingsOverlayProps) {
  const { isDemo } = useDemoRuntimeState();

  if (!isSettingsOpen) {
    return null;
  }

  if (isDemo) {
    return (
      <Suspense fallback={null}>
        <DemoSettingsPreviewOverlay
          onClose={onClose}
          onRunSupportCommand={onRunSupportCommand}
          readwiseReaderCategoryContent={<DemoReadwiseReaderSettingsPreview />}
          requestedCategory={requestedCategory}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <WorkspaceSettingsOverlayContent
        onClose={onClose}
        onRunSupportCommand={onRunSupportCommand}
        requestedCategory={requestedCategory}
        requestedRowId={requestedRowId}
      />
    </Suspense>
  );
}

function DemoReadwiseReaderSettingsPreview() {
  return (
    <SettingsReadwiseReaderContent
      config={demoImportSettings.readwiseReaderConfig}
      onSave={() => undefined}
      readwiseRootPath={demoImportSettings.readwiseRootPath}
      readwiseSources={demoImportSettings.readwiseSources}
    />
  );
}
