import { useState } from 'react';

import type { WebDavRelayOverview } from '../../../../../lib/platform/webDavRelayContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { confirmDesktopWebDavCredentialDelivery, enableDesktopWebDavRelay } from '../../../../shared/platform/desktopSyncGroupRuntimeRepository';
import { SettingsButton, SettingsControlSlot, SettingsFlow, SettingsRow } from '../../../../shared/ui';

import { PublishingTextRow } from './PublishingTextRow';

const PREFIX = 'settings.companionSync.webdav' as const;

export function SettingsWebDavCredentialDelivery({ groupId, delivery, phoneConnected }: {
  groupId: string;
  delivery: NonNullable<WebDavRelayOverview['credential_delivery']>;
  phoneConnected: boolean;
}) {
  const t = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fingerprint = delivery.fingerprint;

  async function reverify() {
    setBusy(true);
    setFailed(false);
    try { await enableDesktopWebDavRelay(groupId, delivery.device_id, true, true); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  async function submitPhoneCredentials() {
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setFailed(false);
    try {
      const pending = confirmDesktopWebDavCredentialDelivery(groupId, delivery.id, fingerprint, username, password);
      setPassword('');
      await pending;
    } catch {
      setFailed(true);
    } finally { setBusy(false); }
  }

  if (!delivery.automatic && !fingerprint) return <SettingsRow description={t(`${PREFIX}.credentialWaitPhone`)} />;
  return <>
    {delivery.automatic && !delivery.queued && phoneConnected && <SettingsRow>
      <SettingsControlSlot>
        <SettingsButton disabled={busy} onClick={() => void reverify()}>{t(`${PREFIX}.credentialVerifyAgain`)}</SettingsButton>
      </SettingsControlSlot>
    </SettingsRow>}
    {!delivery.automatic && <SettingsRow title={t(`${PREFIX}.credentialVerifyDevice`)} description={<>
      {t(`${PREFIX}.credentialCompareFingerprint`)}<br />
      <code className="break-all">{fingerprint}</code>
    </>} />}
    {delivery.desktop_confirmed ? <SettingsRow
      description={t(`${PREFIX}.${delivery.queued && !delivery.phone_confirmed ? 'credentialQueued'
        : delivery.automatic ? 'credentialWaitAutomaticInstall' : 'credentialWaitInstall'}`)} /> : <>
      <SettingsFlow>
        <PublishingTextRow title={t(`${PREFIX}.credentialPhoneUsername`)} label={t(`${PREFIX}.credentialPhoneUsername`)}
          description={null} disabled={busy} value={username} onChange={setUsername} />
        <PublishingTextRow title={t(`${PREFIX}.credentialPhonePassword`)} label={t(`${PREFIX}.credentialPhonePassword`)}
          description={null} disabled={busy} type="password" value={password} onChange={setPassword} />
      </SettingsFlow>
      <SettingsRow description={failed ? <span role="alert">{t(`${PREFIX}.credentialDeliveryFailed`)}</span> : undefined}>
        <SettingsControlSlot>
          <SettingsButton disabled={busy || !username.trim() || !password} onClick={() => void submitPhoneCredentials()}>
            {t(`${PREFIX}.${delivery.automatic ? 'credentialSaveReplacement' : 'credentialConfirmFingerprint'}`)}
          </SettingsButton>
        </SettingsControlSlot>
      </SettingsRow>
    </>}
  </>;
}
