import { Suspense, lazy } from 'react';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import { SuperMemoSessionProvider } from '../../features/import/components/SettingsSuperMemoImport';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { settingsDesktopAdapters } from './settingsDesktopAdapters';
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

  const libraryScope = useWorkspaceStore(state => state.libraryScope);

  if (isDemo) {
    if (!isSettingsOpen) return null;
    return (
      <Suspense fallback={null}>
        <DemoSettingsPreviewOverlay
          desktopAdapters={settingsDesktopAdapters}
          onClose={onClose}
          onRunSupportCommand={onRunSupportCommand}
          readwiseReaderCategoryContent={<DemoReadwiseReaderSettingsPreview />}
          requestedCategory={requestedCategory}
          requestedRowId={requestedRowId}
        />
      </Suspense>
    );
  }

  return (
    <SuperMemoSessionProvider settingsOpen={isSettingsOpen} libraryScope={libraryScope} listenForCommand>
      {isSettingsOpen ? (
        <Suspense fallback={null}>
          <WorkspaceSettingsOverlayContent
            onClose={onClose}
            onRunSupportCommand={onRunSupportCommand}
            requestedCategory={requestedCategory}
            requestedRowId={requestedRowId}
          />
        </Suspense>
      ) : null}
    </SuperMemoSessionProvider>
  );
}

function DemoReadwiseReaderSettingsPreview() {
  return (
    <SettingsReadwiseReaderContent
      config={demoImportSettings.readwiseReaderConfig}
      policy={demoImportSettings.readwiseAutoImportPolicy}
      onChangeSourceMode={() => undefined}
      onSave={() => undefined}
      readwiseRootPath={demoImportSettings.readwiseRootPath}
      readwiseSourceMode={demoImportSettings.readwiseSourceMode}
      readwiseSources={demoImportSettings.readwiseSources}
    />
  );
}
