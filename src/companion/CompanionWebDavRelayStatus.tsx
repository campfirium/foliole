import { useEffect, useState, useSyncExternalStore } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  companionWebDavCredentialDelivery, confirmCompanionWebDavCredential, subscribeCompanionWebDavCredentialDelivery
} from '../shared/platform/companion/sync/companionWebDavCredentialDelivery';
import { loadCompanionWebDavStatus, subscribeCompanionWebDavRelay } from '../shared/platform/companion/sync/companionWebDavRelayStore';
import { AppButton } from '../shared/ui';

export function CompanionWebDavRelayStatus() {
  const t = useTranslation();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof loadCompanionWebDavStatus>>>({
    enabled: false, authenticationStatus: undefined
  });
  const [failed, setFailed] = useState(false);
  const delivery = useSyncExternalStore(subscribeCompanionWebDavCredentialDelivery, companionWebDavCredentialDelivery);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadCompanionWebDavStatus().then(value => {
        if (active) setStatus(value);
      }).catch(() => undefined);
    };
    const stop = subscribeCompanionWebDavRelay(refresh);
    refresh();
    return () => { active = false; stop(); };
  }, []);
  if (delivery) return <div className="flex flex-col gap-2 text-sm">
    <p>{t('settings.companionSync.webdav.credentialCompareFingerprint')}</p>
    <code className="break-all">{delivery.fingerprint}</code>
    {delivery.confirmed ? <p role="status">{t('settings.companionSync.webdav.credentialWaitInstall')}</p> :
      <AppButton onClick={() => {
        setFailed(false);
        void confirmCompanionWebDavCredential(delivery.fingerprint).catch(() => setFailed(true));
      }}>{t('settings.companionSync.webdav.credentialConfirmFingerprint')}</AppButton>}
    {failed || delivery.failed ? <p role="alert">{t('settings.companionSync.webdav.credentialDeliveryFailed')}</p> : null}
  </div>;
  return status.enabled ? <p role="status" className="text-sm text-muted-foreground">
    {t(status.authenticationStatus === 401 ? 'settings.companionSync.webdav.credentialPhoneRejected'
      : status.authenticationStatus === 403 ? 'settings.companionSync.webdav.credentialPermissionDenied'
        : 'settings.companionSync.webdav.enabled')}
  </p> : null;
}
