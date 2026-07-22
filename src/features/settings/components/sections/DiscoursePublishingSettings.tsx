import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppErrorState,
  settingsFieldClassName,
  SettingsSection
} from '../../../../shared/ui';

import { DiscourseAuthorizationRows } from './DiscourseAuthorizationRows';
import { PublishingSetupStep } from './PublishingSetupStep';
import { usePublishingSettings } from './usePublishingSettings';

export function DiscoursePublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const t = useTranslation();
  const state = usePublishingSettings();
  return (
    <SettingsSection ariaLabel={t('settings.publishing.sectionAria')} description={t('settings.publishing.discourse.description')} expanded={props.expanded} onExpandedChange={props.onExpandedChange} title={t('settings.publishing.discourse.title')}>
      {state.error ? <AppErrorState description={t('settings.publishing.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <PublishingSetupStep description={t('settings.publishing.site.description')} step={1} title={t('settings.publishing.site.title')}>
        <input aria-label={t('settings.publishing.site.aria')} className={settingsFieldClassName()} disabled={state.disabled || state.hasApiKey} onBlur={state.saveForumUrl} onChange={(event) => state.updateForm({ siteUrl: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') state.saveForumUrl(); }} value={state.form.siteUrl} />
      </PublishingSetupStep>
      <DiscourseAuthorizationRows
        authorizationResult={state.form.authorizationResult}
        canAuthorize={state.canAuthorize}
        connected={state.hasApiKey}
        onBegin={state.beginAuthorization}
        onResultChange={(authorizationResult) => state.updateForm({ authorizationResult })}
        status={state.status}
      />
      <PublishingSetupStep description={t(state.hasApiKey ? 'settings.publishing.connectionState.connected' : 'settings.publishing.connectionState.notConnected')} step={3} title={t('settings.publishing.connection.title')}>
        {state.hasApiKey
          ? <AppButton disabled={state.disabled} onClick={state.disconnect} variant="subtle">{t('settings.publishing.disconnect')}</AppButton>
          : <AppButton disabled={!state.canCompleteAuthorization} onClick={state.completeAuthorization}>{state.status === 'connecting' ? t('settings.publishing.connection.connecting') : t('settings.publishing.connection.connect')}</AppButton>}
      </PublishingSetupStep>
    </SettingsSection>
  );
}
