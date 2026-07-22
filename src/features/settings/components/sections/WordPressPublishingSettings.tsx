import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';
import {
  AppButton,
  AppErrorState,
  SettingsSection
} from '../../../../shared/ui';

import { PublishingConnectionRow } from './PublishingConnectionRow';
import { PublishingTextRow } from './PublishingTextRow';
import { type WordPressSiteKind, useWordPressPublishingSettings } from './useWordPressPublishingSettings';

const WORDPRESS_COM_CREATE_SITE_URL = 'https://wordpress.com/free/';
const WORDPRESS_COM_PASSWORD_GUIDE_URL = 'https://wordpress.com/support/security/two-step-authentication/application-specific-passwords/';
const WORDPRESS_PASSWORD_GUIDE_URL = 'https://developer.wordpress.org/advanced-administration/security/application-passwords/';

function InlineExternalLink(props: { children: ReactNode; url: string }) {
  return <button className="font-medium text-foreground underline underline-offset-4" onClick={() => void openExternalUrl(props.url)} type="button">{props.children}</button>;
}

function SiteDescription() {
  const t = useTranslation();
  return <>{t('settings.publishing.wordpress.site.descriptionPrefix')}<InlineExternalLink url={WORDPRESS_COM_CREATE_SITE_URL}>WordPress.com ↗</InlineExternalLink>{t('settings.publishing.wordpress.site.descriptionSuffix')}</>;
}

function PasswordDescription({ siteKind }: { siteKind: WordPressSiteKind }) {
  const t = useTranslation();
  if (siteKind === 'unknown') return t('settings.publishing.wordpress.password.beforeAddress');
  const wordpressCom = siteKind === 'wordpressCom';
  return <>
    <InlineExternalLink url={wordpressCom ? WORDPRESS_COM_PASSWORD_GUIDE_URL : WORDPRESS_PASSWORD_GUIDE_URL}>
      {t(wordpressCom ? 'settings.publishing.wordpress.password.wordpressComAction' : 'settings.publishing.wordpress.password.coreAction')}
    </InlineExternalLink>
    {t('settings.publishing.wordpress.password.descriptionSuffix')}
  </>;
}

export function WordPressPublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const t = useTranslation();
  const state = useWordPressPublishingSettings();
  return (
    <SettingsSection
      ariaLabel={t('settings.publishing.wordpress.sectionAria')}
      description={t('settings.publishing.wordpress.description')}
      expanded={props.expanded}
      onExpandedChange={props.onExpandedChange}
      title={t('settings.publishing.wordpress.title')}
    >
      {state.error ? <AppErrorState description={t('settings.publishing.wordpress.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <PublishingTextRow description={<SiteDescription />} disabled={state.fieldsDisabled} error={state.siteUrlInvalid ? t('settings.publishing.wordpress.site.invalid') : undefined} label={t('settings.publishing.wordpress.site.aria')} onChange={(siteUrl) => state.updateForm({ siteUrl })} title={t('settings.publishing.wordpress.site.title')} value={state.form.siteUrl} />
      <PublishingTextRow description={t('settings.publishing.wordpress.username.description')} disabled={state.fieldsDisabled} label={t('settings.publishing.wordpress.username.aria')} onChange={(username) => state.updateForm({ username })} title={t('settings.publishing.wordpress.username.title')} value={state.form.username} />
      <PublishingTextRow description={<PasswordDescription siteKind={state.siteKind} />} disabled={state.fieldsDisabled} error={state.applicationPasswordInvalid ? t(state.siteKind === 'wordpressCom' ? 'settings.publishing.wordpress.password.wordpressComInvalid' : 'settings.publishing.wordpress.password.coreInvalid') : undefined} label={t('settings.publishing.wordpress.password.aria')} onChange={(applicationPassword) => state.updateForm({ applicationPassword })} onEnter={state.submit} {...(state.hasCredentials ? { placeholder: '****************' } : {})} title={t('settings.publishing.wordpress.password.title')} type="password" value={state.form.applicationPassword} />
      <PublishingConnectionRow
        action={state.connected
          ? <AppButton disabled={state.disabled} onClick={state.disconnect} variant="subtle">{t('settings.publishing.wordpress.connection.disconnect')}</AppButton>
          : <AppButton disabled={!state.canConnect} onClick={state.submit}>{state.status === 'connecting' ? t('settings.publishing.wordpress.connection.connecting') : t('settings.publishing.wordpress.connection.connect')}</AppButton>}
        connected={state.connected}
        title={t('settings.publishing.wordpress.connection.title')}
      />
    </SettingsSection>
  );
}
