import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppErrorState, SettingsSection } from '../../../../shared/ui';

import { FoliolePublishingConnectedRows, FoliolePublishingCredentialsRows, FoliolePublishingSiteRows } from './FoliolePublishingSetupRows';
import { useFoliolePublishingSettings } from './useFoliolePublishingSettings';

export function FoliolePublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const t = useTranslation();
  const state = useFoliolePublishingSettings();
  return (
    <SettingsSection
      ariaLabel={t('settings.publishing.foliole.sectionAria')}
      description={t('settings.publishing.foliole.description')}
      expanded={props.expanded}
      onExpandedChange={props.onExpandedChange}
      title="Foliole Publish"
    >
      {state.error ? <AppErrorState description={t('settings.publishing.foliole.error.tryAgain')} surface="panel" title={state.error} /> : null}
      {state.connected ? <FoliolePublishingConnectedRows state={state} /> : null}
      {!state.connected && state.step === 'credentials' ? <FoliolePublishingCredentialsRows state={state} /> : null}
      {!state.connected && state.step === 'site' ? <FoliolePublishingSiteRows state={state} /> : null}
    </SettingsSection>
  );
}
