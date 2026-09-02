import { SettingsPanel } from '../../features/settings/components/SettingsPanel';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import { loadExternalSourceSettingsFolders } from '../../shared/platform/externalSourceSettingsRepository';
import { loadRuntimeLibraryPathSettings } from '../../shared/platform/libraryPathsRuntimeRepository';
import { requestAppConfirmation } from '../../shared/ui';

import { useKeepPreviewDialog } from './importSourceWorkspaceDialogs';
import { loadImportSourceWorkspaceSettings } from './importSourceWorkspaceSettings';
import { KeepImportPreviewDialog } from './KeepImportPreviewDialog';
import { SettingsImportManagementContent } from './SettingsImportManagementContent';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';

interface WorkspaceSettingsOverlayContentProps {
  onClose: () => void;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  requestedCategory: SettingsCategoryId | null;
  requestedRowId: string | null;
}

type ImportSettingsState = ReturnType<typeof useImportSourceWorkspaceState>;
type KeepPreviewState = ReturnType<typeof useKeepPreviewDialog>;

export async function prewarmWorkspaceSettingsOverlayContent() {
  await Promise.allSettled([
    loadImportSourceWorkspaceSettings(),
    loadRuntimeLibraryPathSettings(),
    loadExternalSourceSettingsFolders()
  ]);
}

export function WorkspaceSettingsOverlayContent({
  onClose,
  onRunSupportCommand,
  requestedCategory,
  requestedRowId
}: WorkspaceSettingsOverlayContentProps) {
  const importSettings = useImportSourceWorkspaceState();
  const keepPreview = useKeepPreviewDialog({
    handleConfirmKeepImport: importSettings.handleConfirmKeepImport,
    handleDisableKeepImport: importSettings.handleDisableKeepImport,
    handlePreviewKeepImport: importSettings.handlePreviewKeepImport,
    readwiseSources: importSettings.readwiseSources,
    sources: importSettings.sources
  });

  return (
    <>
      <SettingsPanel
        importCategoryContent={<ImportCategoryContent importSettings={importSettings} keepPreview={keepPreview} />}
        onClose={onClose}
        onRunSupportCommand={onRunSupportCommand}
        readwiseReaderCategoryContent={<ReadwiseReaderCategoryContent importSettings={importSettings} />}
        requestedCategory={requestedCategory}
        requestedRowId={requestedRowId}
      />
      {keepPreview.keepPreviewDialog ? (
        <KeepImportPreviewDialog
          onConfirm={keepPreview.handleConfirmKeepPreview}
          onOpenChange={keepPreview.handleKeepPreviewOpenChange}
          open={keepPreview.keepPreviewDialog.open}
          preview={keepPreview.keepPreviewDialog.preview}
          sourceLabel={keepPreview.previewSource?.primaryPath || 'Watch folder'}
        />
      ) : null}
    </>
  );
}

function ImportCategoryContent(props: {
  importSettings: ImportSettingsState;
  keepPreview: KeepPreviewState;
}) {
  const { importSettings, keepPreview } = props;
  async function handleChangeAction(sourceId: string, value: string) {
    if (value !== 'delete') {
      importSettings.handleChangeAction(sourceId, value);
      return;
    }
    const confirmed = await requestAppConfirmation({
      cancelLabel: 'Cancel',
      confirmLabel: 'Enable',
      description: [
        'Source files in this watch folder will be moved to the system trash after they are successfully imported.'
      ],
      title: 'Confirm enabling'
    });
    if (confirmed) {
      importSettings.handleChangeAction(sourceId, value);
    }
  }
  return (
    <SettingsImportManagementContent
      onChange={importSettings.handleChangeSource}
      onChangeAction={(sourceId, value) => {
        void handleChangeAction(sourceId, value);
      }}
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
        void keepPreview.handleOpenKeepPreview(sourceId, 'sources')
      }
      sources={importSettings.sources}
      titleStrategy={importSettings.titleStrategy}
    />
  );
}

function ReadwiseReaderCategoryContent(props: { importSettings: ImportSettingsState }) {
  const { importSettings } = props;
  return (
    <SettingsReadwiseReaderContent
      config={importSettings.readwiseReaderConfig}
      onSave={importSettings.handleSaveReadwiseReaderSetup}
      onCancelSync={importSettings.cancelReadwiseReaderImport}
      onPreviewSync={importSettings.previewReadwiseReaderImport}
      onPreviewCleanup={importSettings.previewReadwiseImportCleanup}
      onRunCleanup={importSettings.runReadwiseImportCleanup}
      onRunSync={importSettings.runReadwiseReaderImport}
      readwiseRootPath={importSettings.readwiseRootPath}
      readwiseSources={importSettings.readwiseSources}
    />
  );
}
