import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { SettingsExternalSearchSection } from './sections/SettingsExternalSearchSection';
import { useExternalSearchFolders } from './useExternalSearchFolders';

export function DemoSettingsExternalSearchSection() {
  const t = useTranslation();
  const externalSearchFolders = useExternalSearchFolders();

  return (
    <>
      <p className="mb-4 rounded-md border border-settings-control-border bg-settings-control/40 px-4 py-3 text-sm leading-6 text-foreground/68">
        <span className="font-medium text-foreground/72">{t('settings.demoPreview.note.label')}: </span>
        {t('settings.demoPreview.note.externalFolders')}
      </p>
      <SettingsExternalSearchSection
        error={externalSearchFolders.externalSearchError}
        feedback={externalSearchFolders.externalSearchFeedback}
        folders={externalSearchFolders.externalSearchFolders}
        isDesktopRuntime={externalSearchFolders.isDesktopRuntime}
        isLoading={externalSearchFolders.isLoadingExternalSearchFolders}
        isSaving={externalSearchFolders.isSavingExternalSearchFolders}
        onAddFolder={externalSearchFolders.onAddExternalSearchFolder}
        onChooseAttachmentRoot={externalSearchFolders.onChooseExternalAttachmentRoot}
        onChooseFolder={externalSearchFolders.onChooseExternalSearchFolder}
        onRebuildIndex={externalSearchFolders.onRebuildExternalSearchIndex}
        onRemoveFolder={externalSearchFolders.onRemoveExternalSearchFolder}
        onRetryLoad={externalSearchFolders.onRetryLoadExternalSearchFolders}
        onUpdateFolder={externalSearchFolders.onUpdateExternalSearchFolder}
      />
    </>
  );
}
