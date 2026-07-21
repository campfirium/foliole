import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

import { FoliolePublishingSetupRows } from './FoliolePublishingSetupRows';
import { useFoliolePublishingSettings } from './useFoliolePublishingSettings';

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
      <SettingsRow
        description={t('settings.publishing.foliole.localPages.description')}
        title={t('settings.publishing.foliole.localPages.title')}
      >
        <SettingsControlSlot>
          <AppButton disabled={state.status === 'viewing'} onClick={state.view}>
            {t(state.status === 'viewing'
              ? 'settings.publishing.foliole.localPages.opening'
              : 'settings.publishing.foliole.localPages.view')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
      <HostingOverview />
      <FoliolePublishingSetupRows state={state} />
    </SettingsSection>
  );
}
