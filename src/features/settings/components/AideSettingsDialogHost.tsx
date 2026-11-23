import { MessagesSquare } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  SettingsNavigation,
  SettingsNavigationGroup,
  SettingsNavigationItem,
  SettingsSection,
  settingsDialogSurfaceClassName
} from '../../../shared/ui';
import { settingsDialogPane, settingsDialogPaneBody, settingsDialogPaneHeader } from '../../../shared/ui/settingsDialogBounds';
import { subscribeAideSettingsDialogOpen } from '../model/aideSettingsDialogRequests';

import { SettingsAideCustomInstructionsSection } from './sections/SettingsAideCustomInstructionsSection';
import { SettingsAideStorageSection } from './sections/SettingsAideStorageSection';
import { SettingsModelsSection } from './sections/SettingsModelsSection';

const AIDE_SETTINGS_DIALOG_GRID = 'grid h-[min(760px,calc(100dvh-36px))] w-[min(1120px,calc(100vw-36px))] max-w-none grid-cols-[240px_minmax(0,1fr)] overflow-hidden';

export function AideSettingsDialogHost() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeAideSettingsDialogOpen(() => setOpen(true)), []);

  return (
    <AppDialog modal onOpenChange={setOpen} open={open}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label={t('settings.overlay.aria')} onClick={() => setOpen(false)} role="presentation" />
        <AppDialogContent
          aria-describedby="aide-settings-description"
          className={settingsDialogSurfaceClassName(AIDE_SETTINGS_DIALOG_GRID)}
        >
          <SettingsNavigation
            ariaLabel={t('settings.aideDialog.title')}
            navigationLabel={t('settings.aideDialog.navigation')}
            title={<AppDialogTitle className="text-settings-brand font-semibold leading-5">{t('settings.aideDialog.title')}</AppDialogTitle>}
          >
            <SettingsNavigationGroup>
              <SettingsNavigationItem current="page" icon={MessagesSquare} onClick={() => undefined}>
                {t('settings.aideDialog.models.nav')}
              </SettingsNavigationItem>
            </SettingsNavigationGroup>
          </SettingsNavigation>
          <div className={settingsDialogPane}>
            <div aria-hidden="true" className={settingsDialogPaneHeader} />
            <div className={settingsDialogPaneBody}>
              <div className="mb-7 px-5 pb-6">
                <h2 className="m-0 text-xl font-semibold text-foreground">{t('settings.aideDialog.models.nav')}</h2>
                <AppDialogDescription className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground" id="aide-settings-description">
                  {t('settings.aideDialog.models.description')}
                </AppDialogDescription>
              </div>
              <SettingsSection ariaLabel={t('settings.models.section')} title={t('settings.models.section')}>
                <SettingsModelsSection />
              </SettingsSection>
              <SettingsSection
                ariaLabel={t('settings.aide.instructions.section')}
                description={t('settings.aide.instructions.description')}
                title={t('settings.aide.instructions.section')}
              >
                <SettingsAideCustomInstructionsSection />
              </SettingsSection>
              <SettingsSection ariaLabel={t('settings.general.aide.row')}>
                <SettingsAideStorageSection />
              </SettingsSection>
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
