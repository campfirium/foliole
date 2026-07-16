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
import { usePublishingSettings, type PublishingFeedback, type PublishingFormState, type PublishingStatus } from './usePublishingSettings';

function ConnectionRow(props: {
  canTest: boolean;
  feedback: PublishingFeedback;
  hasApiKey: boolean;
  onDisconnect: () => void;
  onTest: () => void;
  status: PublishingStatus;
}) {
  const t = useTranslation();
  const statusLabel = props.status === 'saving'
    ? t('settings.publishing.feedback.saving')
    : props.feedback === 'connected'
      ? t('settings.publishing.feedback.connected')
      : props.feedback === 'saved' ? t('settings.publishing.feedback.saved') : null;
  return (
    <SettingsRow description={t('settings.publishing.connection.description')} title={t('settings.publishing.connection.title')}>
      <SettingsControlSlot className="w-[min(360px,100%)]">
        {statusLabel ? <AppStatusBadge label={statusLabel} tone={props.status === 'saving' ? 'neutral' : 'success'} /> : null}
        <AppButton disabled={!props.canTest} onClick={props.onTest}>
          {props.status === 'testing' ? t('settings.publishing.connection.testing') : t('settings.publishing.connection.test')}
        </AppButton>
        {props.hasApiKey ? <AppButton disabled={props.status !== 'idle'} onClick={props.onDisconnect} variant="subtle">{t('settings.publishing.disconnect')}</AppButton> : null}
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function PublishingRows(props: {
  disabled: boolean;
  form: PublishingFormState;
  hasApiKey: boolean;
  saveApiKey: () => void;
  saveForumUrl: () => void;
  updateForm: (patch: Partial<PublishingFormState>) => void;
}) {
  const t = useTranslation();
  return (
    <>
      <PublishingTextRow description={t('settings.publishing.site.description')} disabled={props.disabled} label={t('settings.publishing.site.aria')} onBlur={props.saveForumUrl} onChange={(siteUrl) => props.updateForm({ siteUrl })} onEnter={props.saveForumUrl} title={t('settings.publishing.site.title')} value={props.form.siteUrl} />
      <PublishingTextRow description={props.hasApiKey ? t('settings.publishing.apiKey.saved') : t('settings.publishing.apiKey.description')} disabled={props.disabled} label={t('settings.publishing.apiKey.aria')} onBlur={props.saveApiKey} onChange={(apiKey) => props.updateForm({ apiKey })} onEnter={props.saveApiKey} {...(props.hasApiKey && !props.form.apiKey ? { placeholder: '****************' } : {})} title={t('settings.publishing.apiKey.title')} type="password" value={props.form.apiKey} />
    </>
  );
}

export function DiscoursePublishingSettings() {
  const t = useTranslation();
  const state = usePublishingSettings();
  return (
    <SettingsSection ariaLabel={t('settings.publishing.sectionAria')} description={t('settings.publishing.discourse.description')} title="Discourse">
      {state.error ? <AppErrorState description={t('settings.publishing.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <PublishingRows disabled={state.disabled} form={state.form} hasApiKey={state.hasApiKey} saveApiKey={state.saveApiKey} saveForumUrl={state.saveForumUrl} updateForm={state.updateForm} />
      <ConnectionRow canTest={state.canTest} feedback={state.feedback} hasApiKey={state.hasApiKey} onDisconnect={state.disconnect} onTest={state.testConnection} status={state.status} />
    </SettingsSection>
  );
}
