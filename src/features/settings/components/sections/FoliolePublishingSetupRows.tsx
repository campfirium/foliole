import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';
import {
  AppButton,
  AppErrorState,
  AppStatusBadge,
  SettingsControlSlot,
  SettingsRow,
  settingsValueBoxClassName
} from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';
import type { FoliolePublishingSettingsState } from './useFoliolePublishingSettings';

const CLOUDFLARE_DASHBOARD_URL = 'https://dash.cloudflare.com/';
const CUSTOM_DOMAIN_GUIDE_URL = 'https://developers.cloudflare.com/pages/configuration/custom-domains/';

function ActionRow(props: { children: ReactNode; description: string; title: string }) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className="w-[min(420px,100%)]">{props.children}</SettingsControlSlot>
    </SettingsRow>
  );
}

export function FoliolePublishingCredentialsRows({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return <>
    <PublishingTextRow description={t('settings.publishing.foliole.account.description')} disabled={state.disabled} label={t('settings.publishing.foliole.account.aria')} onChange={(accountId) => state.updateForm({ accountId })} title={t('settings.publishing.foliole.account.title')} value={state.form.accountId} />
    <PublishingTextRow description={t('settings.publishing.foliole.token.description')} disabled={state.disabled} label={t('settings.publishing.foliole.token.aria')} onChange={(apiToken) => state.updateForm({ apiToken })} {...(state.canContinue ? { onEnter: state.continue } : {})} title={t('settings.publishing.foliole.token.title')} type="password" value={state.form.apiToken} />
    <ActionRow description={t('settings.publishing.foliole.credentials.description')} title={t('settings.publishing.foliole.credentials.title')}>
      <AppButton onClick={() => void openExternalUrl(CLOUDFLARE_DASHBOARD_URL)} variant="subtle">{t('settings.publishing.foliole.openCloudflare')}</AppButton>
      <AppButton disabled={!state.canContinue} onClick={state.continue}>{t('settings.publishing.foliole.continue')}</AppButton>
    </ActionRow>
  </>;
}

export function FoliolePublishingSiteRows({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return <>
    {state.projectConflict ? <AppErrorState description={t('settings.publishing.foliole.conflict.description')} surface="panel" title={t('settings.publishing.foliole.conflict.title')} /> : null}
    <PublishingTextRow description={t('settings.publishing.foliole.project.description')} disabled={state.disabled} label={t('settings.publishing.foliole.project.aria')} onChange={(projectName) => state.updateForm({ projectName })} {...(state.canDeploy ? { onEnter: state.deploy } : {})} title={t('settings.publishing.foliole.project.title')} value={state.form.projectName} />
    <ActionRow description={t('settings.publishing.foliole.create.description')} title={t('settings.publishing.foliole.create.title')}>
      <AppButton disabled={state.disabled} onClick={state.back} variant="subtle">{t('settings.publishing.foliole.back')}</AppButton>
      <AppButton disabled={state.status === 'previewing'} onClick={state.preview} variant="subtle">{state.status === 'previewing' ? t('settings.publishing.foliole.previewing') : t('settings.publishing.foliole.preview')}</AppButton>
      {state.projectConflict ? <AppButton disabled={state.disabled} onClick={state.useExistingProject}>{t('settings.publishing.foliole.useExisting')}</AppButton> : null}
      <AppButton disabled={!state.canDeploy} onClick={state.deploy}>{state.status === 'connecting' ? t('settings.publishing.foliole.creating') : t('settings.publishing.foliole.create.action')}</AppButton>
    </ActionRow>
  </>;
}

export function FoliolePublishingConnectedRows({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  const updateLabel = state.form.customDomain.trim()
    ? t('settings.publishing.foliole.address.update')
    : t('settings.publishing.foliole.address.usePages');
  return <>
    <SettingsRow description={t('settings.publishing.foliole.pages.description')} title={t('settings.publishing.foliole.pages.title')}>
      <SettingsControlSlot className="w-[min(360px,100%)]"><span className={settingsValueBoxClassName()}>{state.pagesUrl}</span></SettingsControlSlot>
    </SettingsRow>
    <PublishingTextRow description={t('settings.publishing.foliole.address.description')} disabled={state.disabled} label={t('settings.publishing.foliole.address.aria')} onChange={(customDomain) => state.updateForm({ customDomain })} title={t('settings.publishing.foliole.address.title')} value={state.form.customDomain} />
    <ActionRow description={t('settings.publishing.foliole.actions.description')} title={t('settings.publishing.foliole.actions.title')}>
      <AppStatusBadge label={t('settings.publishing.foliole.ready')} tone="success" />
      <AppButton onClick={() => void openExternalUrl(CUSTOM_DOMAIN_GUIDE_URL)} variant="subtle">{t('settings.publishing.foliole.address.guide')}</AppButton>
      <AppButton disabled={!state.canUpdateAddress} onClick={state.updateSiteAddress}>{state.status === 'updating' ? t('settings.publishing.foliole.address.updating') : updateLabel}</AppButton>
      <AppButton disabled={state.status === 'previewing'} onClick={state.preview} variant="subtle">{state.status === 'previewing' ? t('settings.publishing.foliole.previewing') : t('settings.publishing.foliole.preview')}</AppButton>
      <AppButton disabled={state.disabled} onClick={state.disconnect} variant="subtle">{t('settings.publishing.disconnect')}</AppButton>
    </ActionRow>
  </>;
}
