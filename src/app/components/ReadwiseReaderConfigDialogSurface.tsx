import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  SettingsSection
} from '../../shared/ui';

import { ReadwiseReaderImportBehavior } from './ReadwiseReaderImportBehavior';
import {
  ReadwiseIntegrationSwitch,
  ReadwiseReaderSetupCheckPanel
} from './ReadwiseReaderSetupCheckPanel';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { ReadwiseReaderSyncRow } from './ReadwiseReaderSyncControls';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

function ReadwiseConfigDialogHeader(props: {
  canChangeIntegration: boolean;
  integrationEnabled: boolean;
  onChangeIntegration: () => void;
}) {
  const t = useTranslation();

  return (
    <header className="flex items-start justify-between gap-4 border-b border-border/70 px-5 pb-4 pt-5">
      <div className="min-w-0">
        <AppDialogTitle className="text-base font-semibold">{t('desktop.readwise.import.title')}</AppDialogTitle>
        <p className="mt-1 text-sm text-foreground/65">
          {t('desktop.readwise.dialog.description')}
        </p>
      </div>
      <ReadwiseIntegrationSwitch
        disabled={!props.canChangeIntegration}
        enabled={props.integrationEnabled}
        onToggle={props.onChangeIntegration}
      />
    </header>
  );
}

function ReadwiseConfigDialogBody(props: {
  canPreview: boolean;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  onCheck: () => void;
}) {
  const t = useTranslation();

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ReadwiseReaderSetupCheckPanel
        canCheck={props.canPreview}
        hasDraftChanges={props.draft.hasDraftChanges}
        isChecking={props.draft.isPreviewing}
        onCheck={props.onCheck}
        result={props.draft.previewResult}
      />
      <div className="py-5">
        <SettingsSection ariaLabel={t('desktop.readwise.section.sync.aria')}>
          <ReadwiseReaderSyncRow
            config={props.draft.draftConfig}
            disabled
            onChange={props.draft.updateConfig}
            onSync={() => undefined}
          />
        </SettingsSection>
        <SettingsSection ariaLabel={t('desktop.readwise.section.behavior.aria')} title={t('desktop.readwise.section.behavior.title')}>
          <ReadwiseReaderImportBehavior
            config={props.draft.draftConfig}
            onChange={props.draft.updateConfig}
          />
        </SettingsSection>
        <SettingsSection ariaLabel={t('desktop.readwise.section.settings.aria')} title={t('desktop.readwise.section.settings.title')}>
          <ReadwiseDirectorySection
            onChooseFolder={props.draft.chooseFolder}
            onChooseRootFolder={props.draft.chooseRootFolder}
            readwiseRootPath={props.draft.draftRootPath}
            sources={props.draft.draftSources}
          />
          <ReadwiseParserFields
            config={props.draft.draftConfig}
            onChange={props.draft.updateConfig}
          />
        </SettingsSection>
      </div>
    </div>
  );
}

export function ReadwiseConfigDialogSurface(props: {
  canChangeIntegration: boolean;
  canPreview: boolean;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  integrationEnabled: boolean;
  onCancel: () => void;
  onChangeIntegration: () => void;
  onCheck: () => void;
}) {
  const t = useTranslation();

  return (
    <AppDialog onOpenChange={props.onCancel} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="w-[min(1280px,calc(100vw-96px))] overflow-hidden p-0"
        >
          <section className="flex max-h-[min(760px,calc(100vh-96px))] min-h-0 flex-col">
            <ReadwiseConfigDialogHeader
              canChangeIntegration={props.canChangeIntegration}
              integrationEnabled={props.integrationEnabled}
              onChangeIntegration={props.onChangeIntegration}
            />
            <ReadwiseConfigDialogBody
              canPreview={props.canPreview}
              draft={props.draft}
              onCheck={props.onCheck}
            />
            <footer className="flex items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
              <AppButton onClick={props.onCancel} variant="ghost">
                {t('desktop.readwise.cancel')}
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
