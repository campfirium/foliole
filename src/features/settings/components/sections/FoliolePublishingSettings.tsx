import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState, AppStatusBadge, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';
import { useFoliolePublishingSettings } from './useFoliolePublishingSettings';

export function FoliolePublishingSettings() {
  const t = useTranslation();
  const state = useFoliolePublishingSettings();
  return (
    <SettingsSection ariaLabel={t('settings.publishing.foliole.sectionAria')} description={t('settings.publishing.foliole.description')} title="Foliole Publish">
      {state.error ? <AppErrorState description={t('settings.publishing.foliole.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <PublishingTextRow description={t('settings.publishing.foliole.account.description')} disabled={state.disabled} label={t('settings.publishing.foliole.account.aria')} onChange={(accountId) => state.updateForm({ accountId })} title={t('settings.publishing.foliole.account.title')} value={state.form.accountId} />
      <PublishingTextRow description={t('settings.publishing.foliole.project.description')} disabled={state.disabled} label={t('settings.publishing.foliole.project.aria')} onChange={(projectName) => state.updateForm({ projectName })} title={t('settings.publishing.foliole.project.title')} value={state.form.projectName} />
      <PublishingTextRow description={state.hasCredentials ? t('settings.publishing.foliole.token.saved') : t('settings.publishing.foliole.token.description')} disabled={state.disabled} label={t('settings.publishing.foliole.token.aria')} onChange={(apiToken) => state.updateForm({ apiToken })} placeholder={state.hasCredentials ? '****************' : ''} title={t('settings.publishing.foliole.token.title')} type="password" value={state.form.apiToken} />
      <PublishingTextRow description={t('settings.publishing.foliole.address.description')} disabled={state.disabled} label={t('settings.publishing.foliole.address.aria')} onChange={(siteAddress) => state.updateForm({ siteAddress })} title={t('settings.publishing.foliole.address.title')} value={state.form.siteAddress} />
      <SettingsRow description={t('settings.publishing.foliole.actions.description')} title={t('settings.publishing.foliole.actions.title')}>
        <SettingsControlSlot className="w-[min(420px,100%)]">
          {state.hasCredentials ? <AppStatusBadge label={t('settings.publishing.foliole.ready')} tone="success" /> : null}
          <AppButton disabled={state.status === 'previewing'} onClick={state.preview}>{state.status === 'previewing' ? t('settings.publishing.foliole.previewing') : t('settings.publishing.foliole.preview')}</AppButton>
          <AppButton disabled={!state.canDeploy} onClick={state.deploy}>{state.status === 'deploying' ? t('settings.publishing.foliole.deploying') : t('settings.publishing.foliole.deploy')}</AppButton>
          {state.hasCredentials ? <AppButton disabled={state.disabled} onClick={state.disconnect} variant="subtle">{t('settings.publishing.disconnect')}</AppButton> : null}
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
