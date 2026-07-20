import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';
import {
  AppButton,
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName,
  settingsValueBoxClassName
} from '../../../../shared/ui';

import type { FoliolePublishingSettingsState } from './useFoliolePublishingSettings';

const CLOUDFLARE_AUTHORIZATION_URL = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=Foliole%20Publish';
const CLOUDFLARE_HOME_URL = 'https://dash.cloudflare.com/';
const CUSTOM_DOMAIN_GUIDE_URL = 'https://developers.cloudflare.com/pages/configuration/custom-domains/';

function InlineExternalLink(props: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="font-medium text-foreground underline underline-offset-4" onClick={props.onClick} type="button">
      {props.children}
    </button>
  );
}

function SetupStep(props: { children?: ReactNode; description: ReactNode; step: number; title: string }) {
  return (
    <div className="grid min-h-settings-row grid-cols-[2rem_minmax(0,1fr)] gap-3 border-t border-settings-divider/70 px-settings-panel-x py-settings-panel-y first:border-t-0">
      <span className="flex size-8 items-center justify-center rounded-full border border-settings-control-border text-ui-md text-foreground/75">{props.step}</span>
      <div className="flex min-w-0 items-start justify-between gap-6 max-[1080px]:flex-col">
        <div className="min-w-0 flex-1">
          <h5 className="text-ui-lg font-semibold text-foreground">{props.title}</h5>
          <p className="mt-1 max-w-[720px] text-ui-md leading-6 text-foreground/64">{props.description}</p>
        </div>
        {props.children ? <SettingsControlSlot className="w-[min(420px,100%)]">{props.children}</SettingsControlSlot> : null}
      </div>
    </div>
  );
}

function SetupInput(props: {
  ariaLabel: string;
  className?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  type?: 'password' | 'text';
  value: string;
}) {
  return <input aria-label={props.ariaLabel} className={settingsFieldClassName(props.className)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} type={props.type ?? 'text'} value={props.value} />;
}

function CustomDomainStep({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return (
    <SetupStep
      description={<><InlineExternalLink onClick={() => void openExternalUrl(CUSTOM_DOMAIN_GUIDE_URL)}>{t('settings.publishing.foliole.address.guide')}</InlineExternalLink>{t('settings.publishing.foliole.address.description')}</>}
      step={5}
      title={t('settings.publishing.foliole.address.title')}
    >
      <SetupInput ariaLabel={t('settings.publishing.foliole.address.aria')} disabled={!state.connected || state.disabled} onChange={(customDomain) => state.updateForm({ customDomain })} placeholder={t('settings.publishing.foliole.address.placeholder')} value={state.form.customDomain} />
      <AppButton disabled={!state.canUpdateAddress} onClick={state.updateSiteAddress}>{state.status === 'updating' ? t('settings.publishing.foliole.address.updating') : t('settings.publishing.foliole.address.save')}</AppButton>
    </SetupStep>
  );
}

function PublishInstructionStep() {
  const t = useTranslation();
  return <SetupStep description={t('settings.publishing.foliole.publish.description')} step={4} title={t('settings.publishing.foliole.publish.title')} />;
}

export function FoliolePublishingSetupRows({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return <>
    <SetupStep
      description={<>{t('settings.publishing.foliole.token.descriptionPrefix')}<InlineExternalLink onClick={() => void openExternalUrl(CLOUDFLARE_AUTHORIZATION_URL)}>{t('settings.publishing.foliole.token.request')}</InlineExternalLink>{t('settings.publishing.foliole.token.descriptionSuffix')}</>}
      step={1}
      title={t('settings.publishing.foliole.token.title')}
    >
      <SetupInput ariaLabel={t('settings.publishing.foliole.token.aria')} disabled={state.connected || state.disabled} onChange={(apiToken) => state.updateForm({ apiToken })} placeholder={t('settings.publishing.foliole.token.placeholder')} type="password" value={state.connected ? 'stored-token' : state.form.apiToken} />
    </SetupStep>
    <SetupStep
      description={<>{t('settings.publishing.foliole.account.descriptionPrefix')}<InlineExternalLink onClick={() => void openExternalUrl(CLOUDFLARE_HOME_URL)}>{t('settings.publishing.foliole.account.home')}</InlineExternalLink>{t('settings.publishing.foliole.account.descriptionSuffix')}</>}
      step={2}
      title={t('settings.publishing.foliole.account.title')}
    >
      <SetupInput ariaLabel={t('settings.publishing.foliole.account.aria')} disabled={state.connected || state.disabled} onChange={(accountId) => state.updateForm({ accountId })} placeholder={t('settings.publishing.foliole.account.placeholder')} value={state.form.accountId} />
    </SetupStep>
    <SetupStep description={t(state.connected ? 'settings.publishing.foliole.project.connectedDescription' : 'settings.publishing.foliole.project.description')} step={3} title={t('settings.publishing.foliole.project.title')}>
      {state.connected ? <>
        <span className={settingsValueBoxClassName('min-w-0 flex-1 truncate')}>{state.pagesUrl}</span>
        <AppButton onClick={() => void openExternalUrl(state.pagesUrl)}>{t('settings.publishing.foliole.pages.visit')}</AppButton>
      </> : <>
        <div className="flex min-w-0 flex-1">
          <SetupInput ariaLabel={t('settings.publishing.foliole.project.aria')} className="rounded-r-none" disabled={state.disabled} onChange={(projectName) => state.updateForm({ projectName })} placeholder={t('settings.publishing.foliole.project.placeholder')} value={state.form.projectName} />
          <span className="flex h-9 items-center rounded-r-md border border-l-0 border-settings-control-border bg-settings-control px-3 text-ui-md text-foreground/60">.pages.dev</span>
        </div>
        <AppButton disabled={!state.canDeploy} onClick={state.deploy}>{state.status === 'connecting' ? t('settings.publishing.foliole.deploying') : t('settings.publishing.foliole.deploy')}</AppButton>
      </>}
    </SetupStep>
    <PublishInstructionStep />
    <CustomDomainStep state={state} />
    {state.connected ? (
      <SettingsRow description={t('settings.publishing.foliole.connection.description')} title={t('settings.publishing.foliole.connection.title')}>
        <SettingsControlSlot><AppButton disabled={state.disabled} onClick={state.disconnect} variant="danger">{t('settings.publishing.foliole.connection.disconnect')}</AppButton></SettingsControlSlot>
      </SettingsRow>
    ) : null}
  </>;
}
