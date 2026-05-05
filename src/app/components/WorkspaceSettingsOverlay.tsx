import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import { SettingsImportManagementContent } from './SettingsImportManagementContent';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function WorkspaceSettingsOverlay({ props }: { props: WorkspaceLayoutProps }) {
  const importSettings = useImportSourceWorkspaceState();

  if (!props.isSettingsOpen) {
    return null;
  }

  return (
    <SettingsPanel
      importCategoryContent={
        <SettingsImportManagementContent
          onChange={importSettings.handleChangeSource}
          onChangeAction={importSettings.handleChangeAction}
          onChangeTitleStrategy={importSettings.handleChangeTitleStrategy}
          onChooseHighlightFolder={(sourceId) => void importSettings.handleChooseFolder(sourceId, 'highlightPath')}
          onChoosePrimaryFolder={(sourceId) => void importSettings.handleChooseFolder(sourceId, 'primaryPath')}
          onCopySource={importSettings.handleCopySource}
          onDeleteSource={importSettings.handleDeleteSource}
          onDisableKeepImport={(sourceId) => importSettings.handleDisableKeepImport(sourceId, 'sources')}
          onPreviewKeepImport={(sourceId) => void importSettings.handlePreviewKeepImport(sourceId, 'sources')}
          sources={importSettings.sources}
          titleStrategy={importSettings.titleStrategy}
        />
      }
      onClose={props.onCloseSettings}
      readwiseReaderCategoryContent={
        <SettingsReadwiseReaderContent
          config={importSettings.readwiseReaderConfig}
          onSave={importSettings.handleSaveReadwiseReaderSetup}
          readwiseRootPath={importSettings.readwiseRootPath}
          readwiseSources={importSettings.readwiseSources}
        />
      }
      requestedCategory={props.requestedSettingsCategory}
    />
  );
}
