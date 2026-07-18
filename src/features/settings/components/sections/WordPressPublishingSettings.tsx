import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppErrorState,
  AppStatusBadge,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';
import { useWordPressPublishingSettings } from './useWordPressPublishingSettings';

export function WordPressPublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const t = useTranslation();
  const state = useWordPressPublishingSettings();
  const credentialDescription = state.isWordPressCom
    ? t('settings.publishing.wordpress.password.wordpressComDescription')
    : t('settings.publishing.wordpress.password.coreDescription');
  return (
    <SettingsSection
      ariaLabel={t('settings.publishing.wordpress.sectionAria')}
      description={t('settings.publishing.wordpress.description')}
      expanded={props.expanded}
      onExpandedChange={props.onExpandedChange}
      title="WordPress"
    >
      {state.error ? <AppErrorState description={t('settings.publishing.wordpress.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <PublishingTextRow description={t('settings.publishing.wordpress.site.description')} disabled={state.disabled} label={t('settings.publishing.wordpress.site.aria')} onChange={(siteUrl) => state.updateForm({ siteUrl })} title={t('settings.publishing.wordpress.site.title')} value={state.form.siteUrl} />
      <PublishingTextRow description={t('settings.publishing.wordpress.username.description')} disabled={state.disabled} label={t('settings.publishing.wordpress.username.aria')} onChange={(username) => state.updateForm({ username })} title={t('settings.publishing.wordpress.username.title')} value={state.form.username} />
      <PublishingTextRow description={credentialDescription} disabled={state.disabled} label={t('settings.publishing.wordpress.password.aria')} onChange={(applicationPassword) => state.updateForm({ applicationPassword })} onEnter={state.submit} {...(state.hasCredentials ? { placeholder: '****************' } : {})} title={t('settings.publishing.wordpress.password.title')} type="password" value={state.form.applicationPassword} />
      <SettingsRow description={t('settings.publishing.wordpress.connection.description')} title={t('settings.publishing.wordpress.connection.title')}>
        <SettingsControlSlot className="w-[min(360px,100%)]">
          {state.connected ? <AppStatusBadge label={t('settings.publishing.feedback.connected')} tone="success" /> : null}
          <AppButton disabled={!state.canConnect} onClick={state.submit}>
            {state.status === 'connecting' ? t('settings.publishing.wordpress.connection.connecting') : t('settings.publishing.wordpress.connection.connect')}
          </AppButton>
          {state.hasCredentials ? <AppButton disabled={state.disabled} onClick={state.disconnect} variant="subtle">{t('settings.publishing.disconnect')}</AppButton> : null}
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
