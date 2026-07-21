import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

import { FoliolePublishingSetupRows } from './FoliolePublishingSetupRows';
import { useFoliolePublishingSettings, type FoliolePublishingSettingsState } from './useFoliolePublishingSettings';

function HostingOverview() {
  const t = useTranslation();
  return (
    <div className="border-t border-settings-divider/70 px-settings-panel-x pt-7">
      <h4 className="text-ui-lg font-semibold text-foreground">{t('settings.publishing.foliole.hosting.title')}</h4>
      <div className="ml-6 mt-5 border-t border-settings-divider/70 py-6">
        <h5 className="text-ui-lg font-semibold text-foreground">Cloudflare Pages</h5>
        <p className="mt-1 max-w-[840px] text-ui-md leading-6 text-foreground/64">{t('settings.publishing.foliole.cloudflare.description')}</p>
        <p className="mt-1 max-w-[840px] text-ui-md font-bold leading-6 text-foreground">
          {t('settings.publishing.foliole.cloudflare.securityNotice')}
        </p>
      </div>
    </div>
  );
}

function LocalStaticPagesOverview({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return (
    <div className="px-settings-panel-x py-settings-panel-y" data-local-static-pages>
      <SettingsRow className="min-h-0 px-0 py-0" description={t('settings.publishing.foliole.localPages.description')} title={t('settings.publishing.foliole.localPages.title')}>
        <SettingsControlSlot>
          <AppButton disabled={state.status === 'viewing'} onClick={state.view}>
            {t(state.status === 'viewing' ? 'settings.publishing.foliole.localPages.opening' : 'settings.publishing.foliole.localPages.view')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      <div className="ml-6 mt-5 border-t border-settings-divider/70">
        <SettingsRow className="px-0" description={t('settings.publishing.foliole.theme.description')} title={t('settings.publishing.foliole.theme.title')}>
          <SettingsControlSlot className="gap-5 max-[1080px]:flex-wrap">
            <div className="flex gap-2">
              <AppButton disabled={state.disabled} onClick={state.openTheme} variant="subtle">
                {t(state.status === 'openingTheme' ? 'settings.publishing.foliole.theme.opening' : 'settings.publishing.foliole.theme.open')}
              </AppButton>
              <AppButton disabled={state.disabled} onClick={state.resetTheme} variant="subtle">
                {t(state.status === 'resettingTheme' ? 'settings.publishing.foliole.theme.resetting' : 'settings.publishing.foliole.theme.reset')}
              </AppButton>
            </div>
            <div className="flex gap-2">
              <AppButton disabled={state.disabled} onClick={state.updateThemePages}>
                {t(state.status === 'updatingThemePages' ? 'settings.publishing.foliole.theme.updating' : 'settings.publishing.foliole.theme.update')}
              </AppButton>
              <AppButton disabled={!state.canPublishThemeChanges} onClick={state.publishThemeChanges} variant="emphasis">
                {t(state.status === 'publishingTheme' ? 'settings.publishing.foliole.theme.publishing' : 'settings.publishing.foliole.theme.publish')}
              </AppButton>
            </div>
          </SettingsControlSlot>
        </SettingsRow>
      </div>
    </div>
  );
}

export function FoliolePublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const t = useTranslation();
  const state = useFoliolePublishingSettings();
  return (
    <SettingsSection
      ariaLabel={t('settings.publishing.foliole.sectionAria')}
      description={t('settings.publishing.foliole.description')}
      expanded={props.expanded}
      onExpandedChange={props.onExpandedChange}
      title={t('settings.publishing.foliole.title')}
    >
      {state.error ? <AppErrorState description={t('settings.publishing.foliole.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <LocalStaticPagesOverview state={state} />
      <HostingOverview />
      <FoliolePublishingSetupRows state={state} />
    </SettingsSection>
  );
}
