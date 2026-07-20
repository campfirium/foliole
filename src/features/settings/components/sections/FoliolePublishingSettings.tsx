import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppErrorState, SettingsSection } from '../../../../shared/ui';

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
        <p className="mt-1 max-w-[840px] text-ui-md font-medium leading-6 text-destructive">
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
      <HostingOverview />
      <FoliolePublishingSetupRows state={state} />
    </SettingsSection>
  );
}
