import { useId, useState, type ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';
import {
  AppButton,
  settingsFieldClassName,
  settingsValueBoxClassName
} from '../../../../shared/ui';

import { PublishingConnectionRow } from './PublishingConnectionRow';
import { PublishingSetupStep } from './PublishingSetupStep';
import type { FoliolePublishingSettingsState } from './useFoliolePublishingSettings';

const CLOUDFLARE_AUTHORIZATION_URL = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=Foliole%20Publish';
const CLOUDFLARE_HOME_URL = 'https://dash.cloudflare.com/';
const CUSTOM_DOMAIN_GUIDE_URL = 'https://developers.cloudflare.com/pages/configuration/custom-domains/';
const STORED_TOKEN_MASK = '••••••••••••';

function InlineExternalLink(props: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="font-medium text-foreground underline underline-offset-4" onClick={props.onClick} type="button">
      {props.children}
    </button>
  );
}

function SetupInput(props: {
  ariaDescribedBy?: string | undefined;
  ariaLabel: string;
  className?: string;
  disabled: boolean;
  invalid?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onEnter?: () => void;
  onFocus?: () => void;
  placeholder: string;
  type?: 'password' | 'text';
  value: string;
}) {
  return <input aria-describedby={props.ariaDescribedBy} aria-invalid={props.invalid || undefined} aria-label={props.ariaLabel} className={settingsFieldClassName(props.className)} disabled={props.disabled} onBlur={props.onBlur} onChange={(event) => props.onChange(event.target.value)} onFocus={props.onFocus} onKeyDown={(event) => { if (event.key === 'Enter') props.onEnter?.(); }} placeholder={props.placeholder} type={props.type ?? 'text'} value={props.value} />;
}

function CredentialInput(props: Parameters<typeof SetupInput>[0] & { error?: string | undefined }) {
  const errorId = useId();
  return (
    <div className="min-w-0 flex-1">
      <SetupInput {...props} ariaDescribedBy={props.error ? errorId : undefined} invalid={Boolean(props.error)} />
      {props.error ? <p className="mt-1 text-sm leading-5 text-error" id={errorId} role="alert">{props.error}</p> : null}
    </div>
  );
}

function CustomDomainStep({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return (
    <PublishingSetupStep
      description={<><InlineExternalLink onClick={() => void openExternalUrl(CUSTOM_DOMAIN_GUIDE_URL)}>{t('settings.publishing.foliole.address.guide')}</InlineExternalLink>{t('settings.publishing.foliole.address.description')}</>}
      step={5}
      title={t('settings.publishing.foliole.address.title')}
    >
      <SetupInput ariaLabel={t('settings.publishing.foliole.address.aria')} disabled={!state.connected || state.disabled} onChange={(customDomain) => state.updateForm({ customDomain })} placeholder={t('settings.publishing.foliole.address.placeholder')} value={state.form.customDomain} />
      <AppButton disabled={!state.canUpdateAddress} onClick={state.updateSiteAddress}>{state.status === 'updating' ? t('settings.publishing.foliole.address.updating') : t('settings.publishing.foliole.address.save')}</AppButton>
    </PublishingSetupStep>
  );
}

function PublishInstructionStep() {
  const t = useTranslation();
  return <PublishingSetupStep description={t('settings.publishing.foliole.publish.description')} step={4} title={t('settings.publishing.foliole.publish.title')} />;
}

export function FoliolePublishingSetupRows({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  const [editingSavedToken, setEditingSavedToken] = useState(false);
  const tokenValue = state.form.apiToken || (state.hasSavedToken && !editingSavedToken ? STORED_TOKEN_MASK : '');
  return <>
    <PublishingSetupStep
      description={<>{t('settings.publishing.foliole.token.descriptionPrefix')}<InlineExternalLink onClick={() => void openExternalUrl(CLOUDFLARE_AUTHORIZATION_URL)}>{t('settings.publishing.foliole.token.request')}</InlineExternalLink>{t('settings.publishing.foliole.token.descriptionSuffix')}</>}
      step={1}
      title={t('settings.publishing.foliole.token.title')}
    >
      <CredentialInput ariaLabel={t('settings.publishing.foliole.token.aria')} disabled={state.connected || state.disabled} error={state.apiTokenInvalid ? t('settings.publishing.foliole.token.invalid') : undefined} onBlur={() => { setEditingSavedToken(false); state.saveDraft(); }} onChange={(apiToken) => state.updateForm({ apiToken })} onEnter={() => { setEditingSavedToken(false); state.saveDraft(); }} onFocus={() => { if (state.hasSavedToken && !state.form.apiToken) setEditingSavedToken(true); }} placeholder={t('settings.publishing.foliole.token.placeholder')} type="password" value={tokenValue} />
    </PublishingSetupStep>
    <PublishingSetupStep
      description={<>{t('settings.publishing.foliole.account.descriptionPrefix')}<InlineExternalLink onClick={() => void openExternalUrl(CLOUDFLARE_HOME_URL)}>{t('settings.publishing.foliole.account.home')}</InlineExternalLink>{t('settings.publishing.foliole.account.descriptionSuffix')}</>}
      step={2}
      title={t('settings.publishing.foliole.account.title')}
    >
      <CredentialInput ariaLabel={t('settings.publishing.foliole.account.aria')} disabled={state.connected || state.disabled} error={state.accountIdInvalid ? t('settings.publishing.foliole.account.invalid') : undefined} onBlur={state.saveDraft} onChange={(accountId) => state.updateForm({ accountId })} onEnter={state.saveDraft} placeholder={t('settings.publishing.foliole.account.placeholder')} value={state.form.accountId} />
    </PublishingSetupStep>
    <PublishingSetupStep description={t(state.connected ? 'settings.publishing.foliole.project.connectedDescription' : 'settings.publishing.foliole.project.description')} step={3} title={t('settings.publishing.foliole.project.title')}>
      {state.connected ? <>
        <span className={settingsValueBoxClassName('min-w-0 flex-1 truncate')}>{state.pagesUrl}</span>
        <AppButton onClick={state.visitPages}>{t('settings.publishing.foliole.pages.visit')}</AppButton>
      </> : <>
        <div className="flex min-w-0 flex-1">
          <SetupInput ariaLabel={t('settings.publishing.foliole.project.aria')} className="rounded-r-none" disabled={state.disabled} onBlur={state.saveDraft} onChange={(projectName) => state.updateForm({ projectName })} onEnter={state.saveDraft} placeholder={t('settings.publishing.foliole.project.placeholder')} value={state.form.projectName} />
          <span className="flex h-9 items-center rounded-r-md border border-l-0 border-settings-control-border bg-settings-control px-3 text-ui-md text-foreground/60">.pages.dev</span>
        </div>
        <AppButton disabled={!state.canDeploy} onClick={state.deploy}>{state.status === 'connecting' ? t('settings.publishing.foliole.deploying') : t('settings.publishing.foliole.deploy')}</AppButton>
      </>}
    </PublishingSetupStep>
    <PublishInstructionStep />
    <CustomDomainStep state={state} />
    <PublishingConnectionRow
      action={state.connected ? <AppButton disabled={state.disabled} onClick={state.disconnect} variant="danger">{t('settings.publishing.foliole.connection.disconnect')}</AppButton> : undefined}
      connected={state.connected}
      title={t('settings.publishing.foliole.connection.title')}
    />
  </>;
}
