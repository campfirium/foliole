import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppErrorState,
  settingsFieldClassName,
  SettingsFlow,
  SettingsSection
} from '../../../../shared/ui';

import { DiscourseAuthorizationRows } from './DiscourseAuthorizationRows';
import { PublishingConnectionFooter } from './PublishingConnectionFooter';
import { PublishingSetupStep } from './PublishingSetupStep';
import { usePublishingSettings } from './usePublishingSettings';

export function DiscoursePublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void; previewDesktopSettings?: boolean }) {
  const t = useTranslation();
  const state = usePublishingSettings(Boolean(props.previewDesktopSettings));
  return (
    <SettingsSection ariaLabel={t('settings.publishing.sectionAria')} description={t('settings.publishing.discourse.description')} expanded={props.expanded} onExpandedChange={props.onExpandedChange} title={t('settings.publishing.discourse.title')}>
      {state.error ? <AppErrorState description={t('settings.publishing.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <SettingsFlow>
        <PublishingSetupStep description={t('settings.publishing.site.description')} title={t('settings.publishing.site.title')}>
          <input aria-label={t('settings.publishing.site.aria')} autoComplete="off" className={settingsFieldClassName()} disabled={state.disabled || state.hasApiKey} name="discourse-publish-site-url" onBlur={state.saveForumUrl} onChange={(event) => state.updateForm({ siteUrl: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') state.saveForumUrl(); }} spellCheck={false} type="url" value={state.form.siteUrl} />
        </PublishingSetupStep>
        <DiscourseAuthorizationRows
          authorizationResult={state.form.authorizationResult}
          canAuthorize={state.canAuthorize}
          connected={state.hasApiKey}
          onBegin={state.beginAuthorization}
          onResultChange={(authorizationResult) => state.updateForm({ authorizationResult })}
          status={state.status}
        />
      </SettingsFlow>
      <PublishingConnectionFooter
        action={state.hasApiKey
          ? <AppButton disabled={state.disabled} onClick={state.disconnect}>{t('settings.publishing.disconnect')}</AppButton>
          : <AppButton disabled={!state.canCompleteAuthorization} loading={state.status === 'connecting'} loadingLabel={t('settings.publishing.connection.connecting')} onClick={state.completeAuthorization}>{t('settings.publishing.connection.connect')}</AppButton>}
        connected={state.hasApiKey}
        title={t('settings.publishing.connection.title')}
      />
    </SettingsSection>
  );
}
