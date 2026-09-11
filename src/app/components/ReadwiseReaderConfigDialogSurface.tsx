import type {
  ReadwiseAutoImportPolicy,
  ReadwiseAutoImportPolicyField,
  ReadwiseImportDestination
} from '../../../lib/core/import/readwiseAutoImportPolicy';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
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

function ReadwiseConfigDialogIntro(props: {
  canChangeIntegration: boolean;
  integrationEnabled: boolean;
  onChangeIntegration: () => void;
}) {
  const t = useTranslation();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-foreground/65">{t('desktop.readwise.dialog.description')}</p>
      </div>
      <ReadwiseIntegrationSwitch
        disabled={!props.canChangeIntegration}
        enabled={props.integrationEnabled}
        onToggle={props.onChangeIntegration}
      />
    </div>
  );
}

function ReadwiseConfigDialogBody(props: {
  canPreview: boolean;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  onChangePolicy: (
    field: ReadwiseAutoImportPolicyField,
    value: ReadwiseImportDestination
  ) => void;
  onCheck: () => void;
  policy: ReadwiseAutoImportPolicy;
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
            onChange={props.onChangePolicy}
            onChangeImportTag={() => undefined}
            policy={props.policy}
            sourceMode="folder"
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
  onChangePolicy: (
    field: ReadwiseAutoImportPolicyField,
    value: ReadwiseImportDestination
  ) => void;
  onCheck: () => void;
  policy: ReadwiseAutoImportPolicy;
}) {
  const t = useTranslation();

  return (
    <AppDialog onOpenChange={props.onCancel} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="max-h-[min(760px,calc(100vh-96px))] w-[min(1280px,calc(100vw-96px))]"
          layout="task"
        >
          <AppDialogTitle className="text-base font-semibold">{t('desktop.readwise.import.title')}</AppDialogTitle>
          <AppDialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ReadwiseConfigDialogIntro
              canChangeIntegration={props.canChangeIntegration}
              integrationEnabled={props.integrationEnabled}
              onChangeIntegration={props.onChangeIntegration}
            />
            <div className="mt-4 min-h-0 flex-1 overflow-hidden"><ReadwiseConfigDialogBody
              canPreview={props.canPreview}
              draft={props.draft}
              onChangePolicy={props.onChangePolicy}
              onCheck={props.onCheck}
              policy={props.policy}
            /></div>
          </AppDialogBody>
          <AppDialogActions className="justify-between">
              <AppButton onClick={props.onCancel} variant="ghost">
                {t('desktop.readwise.cancel')}
              </AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
