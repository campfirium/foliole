import { SettingsPanel } from '../../features/settings/components/SettingsPanel';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';

import { SettingsImportManagementContent } from './SettingsImportManagementContent';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';

export interface WorkspaceSettingsOverlayProps {
  isSettingsOpen: boolean;
  onClose: () => void;
  requestedCategory: SettingsCategoryId | null;
}

interface WorkspaceSettingsOverlaySource {
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  requestedSettingsCategory: SettingsCategoryId | null;
}

export function selectWorkspaceSettingsOverlayProps(
  props: WorkspaceSettingsOverlaySource
): WorkspaceSettingsOverlayProps {
  return {
    isSettingsOpen: props.isSettingsOpen,
    onClose: props.onCloseSettings,
    requestedCategory: props.requestedSettingsCategory
  };
}

export function WorkspaceSettingsOverlay({
  isSettingsOpen,
  onClose,
  requestedCategory
}: WorkspaceSettingsOverlayProps) {
  if (!isSettingsOpen) {
    return null;
  }

  return (
    <WorkspaceSettingsOverlayContent onClose={onClose} requestedCategory={requestedCategory} />
  );
}

function WorkspaceSettingsOverlayContent({
  onClose,
  requestedCategory
}: {
  onClose: () => void;
  requestedCategory: SettingsCategoryId | null;
}) {
  const importSettings = useImportSourceWorkspaceState();

  return (
    <SettingsPanel
      importCategoryContent={
        <SettingsImportManagementContent
          onChange={importSettings.handleChangeSource}
          onChangeAction={importSettings.handleChangeAction}
          onChangeTitleStrategy={importSettings.handleChangeTitleStrategy}
          onChooseHighlightFolder={(sourceId) =>
            void importSettings.handleChooseFolder(sourceId, 'highlightPath')
          }
          onChoosePrimaryFolder={(sourceId) =>
            void importSettings.handleChooseFolder(sourceId, 'primaryPath')
          }
          onCopySource={importSettings.handleCopySource}
          onDeleteSource={importSettings.handleDeleteSource}
          onDisableKeepImport={(sourceId) =>
            importSettings.handleDisableKeepImport(sourceId, 'sources')
          }
          onPreviewKeepImport={(sourceId) =>
            void importSettings.handlePreviewKeepImport(sourceId, 'sources')
          }
          sources={importSettings.sources}
          titleStrategy={importSettings.titleStrategy}
        />
      }
      onClose={onClose}
      readwiseReaderCategoryContent={
        <SettingsReadwiseReaderContent
          config={importSettings.readwiseReaderConfig}
          onSave={importSettings.handleSaveReadwiseReaderSetup}
          onPreviewSync={importSettings.previewReadwiseReaderImport}
          onPreviewCleanup={importSettings.previewReadwiseImportCleanup}
          onRunCleanup={importSettings.runReadwiseImportCleanup}
          onRunSync={importSettings.runReadwiseReaderImport}
          readwiseRootPath={importSettings.readwiseRootPath}
          readwiseSources={importSettings.readwiseSources}
        />
      }
      requestedCategory={requestedCategory}
    />
  );
}
