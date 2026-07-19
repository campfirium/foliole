import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppErrorState,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../../../shared/ui';

import { DiscourseAuthorizationRows } from './DiscourseAuthorizationRows';
import { PublishingTextRow } from './PublishingTextRow';
import { usePublishingSettings, type PublishingFeedback, type PublishingFormState, type PublishingStatus } from './usePublishingSettings';

function ConnectionRow(props: {
  canTest: boolean;
  feedback: PublishingFeedback;
  onDisconnect: () => void;
  onTest: () => void;
  status: PublishingStatus;
}) {
  const t = useTranslation();
  return (
    <SettingsRow
      description={props.feedback === 'connected' ? t('settings.publishing.connection.verified') : t('settings.publishing.connection.description')}
      title={t('settings.publishing.connection.title')}
    >
      <SettingsControlSlot className="w-[min(360px,100%)]">
        <AppButton disabled={!props.canTest} onClick={props.onTest}>
          {props.status === 'testing' ? t('settings.publishing.connection.testing') : t('settings.publishing.connection.test')}
        </AppButton>
        <AppButton disabled={props.status !== 'idle'} onClick={props.onDisconnect} variant="subtle">{t('settings.publishing.disconnect')}</AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function PublishingRows(props: {
  disabled: boolean;
  form: PublishingFormState;
  saveForumUrl: () => void;
  updateForm: (patch: Partial<PublishingFormState>) => void;
}) {
  const t = useTranslation();
  return (
    <>
      <PublishingTextRow description={t('settings.publishing.site.description')} disabled={props.disabled} label={t('settings.publishing.site.aria')} onBlur={props.saveForumUrl} onChange={(siteUrl) => props.updateForm({ siteUrl })} onEnter={props.saveForumUrl} title={t('settings.publishing.site.title')} value={props.form.siteUrl} />
    </>
  );
}

export function DiscoursePublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const t = useTranslation();
  const state = usePublishingSettings();
  return (
    <SettingsSection ariaLabel={t('settings.publishing.sectionAria')} description={t('settings.publishing.discourse.description')} expanded={props.expanded} onExpandedChange={props.onExpandedChange} title="Discourse">
      {state.error ? <AppErrorState description={t('settings.publishing.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <PublishingRows disabled={state.disabled} form={state.form} saveForumUrl={state.saveForumUrl} updateForm={state.updateForm} />
      <DiscourseAuthorizationRows
        authorizationResult={state.form.authorizationResult}
        canAuthorize={state.canAuthorize}
        canComplete={state.canCompleteAuthorization}
        onBegin={state.beginAuthorization}
        onComplete={state.completeAuthorization}
        onResultChange={(authorizationResult) => state.updateForm({ authorizationResult })}
        status={state.status}
      />
      {state.hasApiKey ? <ConnectionRow canTest={state.canTest} feedback={state.feedback} onDisconnect={state.disconnect} onTest={state.testConnection} status={state.status} /> : null}
    </SettingsSection>
  );
}
