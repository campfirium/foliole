import { useRef, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openWindowsDefaultAppSettings } from '../../../../shared/platform/desktopHostCapabilities';
import { resolveRuntimeOperatingSystem } from '../../../../shared/platform/runtime/operatingSystem';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { SETTINGS_MARKDOWN_ASSOCIATION_SEARCH_ROW_ID } from '../../model/settingsSearchRowCatalog';

export function SettingsMarkdownAssociationSection() {
  const t = useTranslation();
  const platform = resolveRuntimeOperatingSystem();
  const [showInstructions, setShowInstructions] = useState(false);
  const configureButtonRef = useRef<HTMLButtonElement>(null);

  async function configureDefaultApp() {
    if (platform === 'windows') {
      try {
        await openWindowsDefaultAppSettings();
        return;
      } catch {
        // The dialog includes the manual path when Windows Settings cannot be opened.
      }
    }
    setShowInstructions(true);
  }

  return (
    <SettingsSection
      ariaLabel={t('settings.markdownAssociation.title')}
      description={t('settings.markdownAssociation.description')}
      searchRowId={SETTINGS_MARKDOWN_ASSOCIATION_SEARCH_ROW_ID}
      title={t('settings.markdownAssociation.title')}
    >
      <SettingsRow title={t('settings.markdownAssociation.defaultApp')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button className={settingsButtonClassName()} onClick={() => void configureDefaultApp()} ref={configureButtonRef} type="button">
            {t('settings.markdownAssociation.configure')}
          </button>
        </SettingsControlSlot>
      </SettingsRow>
      <AppDialog open={showInstructions} onOpenChange={setShowInstructions}>
        <AppDialogPortal>
          <AppDialogOverlay />
          <AppDialogContent
            className="w-[calc(100vw-3rem)] max-w-[480px]"
            layout="task"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              configureButtonRef.current?.focus();
            }}
          >
            <AppDialogTitle>{t('settings.markdownAssociation.defaultApp')}</AppDialogTitle>
            <AppDialogBody>
              <AppDialogDescription className="whitespace-pre-line">
                {t(platform === 'macos' ? 'settings.markdownAssociation.macInstructions'
                  : platform === 'windows' ? 'settings.markdownAssociation.windowsInstructions'
                  : 'settings.markdownAssociation.linuxInstructions')}
              </AppDialogDescription>
            </AppDialogBody>
            <AppDialogActions>
              <AppButton onClick={() => setShowInstructions(false)}>{t('shared.close')}</AppButton>
            </AppDialogActions>
          </AppDialogContent>
        </AppDialogPortal>
      </AppDialog>
    </SettingsSection>
  );
}
