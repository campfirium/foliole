import { useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionWebDavRelay, subscribeCompanionWebDavRelay } from '../shared/platform/companion/sync/companionWebDavRelayStore';

export function CompanionWebDavRelayStatus() {
  const t = useTranslation();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadCompanionWebDavRelay().then(binding => {
        if (active) setEnabled(Boolean(binding));
      }).catch(() => undefined);
    };
    const stop = subscribeCompanionWebDavRelay(refresh);
    refresh();
    return () => { active = false; stop(); };
  }, []);
  return enabled ? <p role="status" className="text-sm text-muted-foreground">
    {t('settings.companionSync.webdav.enabled')}
  </p> : null;
}
