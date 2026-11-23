import { ListPlus, MessagesSquare, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  SettingsNavigation,
  SettingsNavigationGroup,
  SettingsNavigationItem,
  SettingsSection,
  settingsDialogSurfaceClassName
} from '../../../shared/ui';
import { settingsDialogGrid, settingsDialogPane } from '../../../shared/ui/settingsDialogBounds';
import { subscribeAideSettingsDialogOpen } from '../model/aideSettingsDialogRequests';

import { AideSettingsContextPane } from './AideSettingsContextPane';
import { AideSettingsPaneFrame } from './AideSettingsPaneFrame';
import { AideSettingsPermissionsPane } from './AideSettingsPermissionsPane';
import { SettingsAideCustomInstructionsSection } from './sections/SettingsAideCustomInstructionsSection';
import { SettingsAideStorageSection } from './sections/SettingsAideStorageSection';
import { SettingsModelsSection } from './sections/SettingsModelsSection';

export function AideSettingsDialogHost() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<AideSettingsPane>('models');

  useEffect(() => subscribeAideSettingsDialogOpen(() => setOpen(true)), []);

  return (
    <AppDialog modal onOpenChange={setOpen} open={open}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label={t('settings.overlay.aria')} onClick={() => setOpen(false)} role="presentation" />
        <AppDialogContent
          aria-describedby="aide-settings-description"
          className={settingsDialogSurfaceClassName(settingsDialogGrid)}
        >
          <SettingsNavigation
            ariaLabel={t('settings.aideDialog.title')}
            navigationLabel={t('settings.aideDialog.navigation')}
            title={<AppDialogTitle className="text-settings-brand font-semibold leading-5">{t('settings.aideDialog.title')}</AppDialogTitle>}
          >
            <SettingsNavigationGroup>
              <SettingsNavigationItem current={pane === 'models' ? 'page' : undefined} icon={MessagesSquare} onClick={() => setPane('models')}>
                {t('settings.aideDialog.models.nav')}
              </SettingsNavigationItem>
              <SettingsNavigationItem current={pane === 'context' ? 'page' : undefined} icon={ListPlus} onClick={() => setPane('context')}>
                {t('settings.aideDialog.context.nav')}
              </SettingsNavigationItem>
              <SettingsNavigationItem current={pane === 'permissions' ? 'page' : undefined} icon={ShieldCheck} onClick={() => setPane('permissions')}>
                {t('settings.aideDialog.permissions.nav')}
              </SettingsNavigationItem>
            </SettingsNavigationGroup>
          </SettingsNavigation>
          <div className={settingsDialogPane}>
            {pane === 'context' ? <AideSettingsContextPane /> : null}
            {pane === 'permissions' ? <AideSettingsPermissionsPane /> : null}
            {pane === 'models' ? <AideSettingsModelsPane /> : null}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

type AideSettingsPane = 'context' | 'models' | 'permissions';

function AideSettingsModelsPane() {
  const t = useTranslation();
  return (
    <AideSettingsPaneFrame description={t('settings.aideDialog.models.description')} title={t('settings.aideDialog.models.nav')}>
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
    </AideSettingsPaneFrame>
  );
}
