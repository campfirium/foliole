import { useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { openImportPermissionSettings } from '../../../shared/platform/import/importAccess';
import { resolveRuntimeOperatingSystem } from '../../../shared/platform/runtime/operatingSystem';
import { AppButton } from '../../../shared/ui';

export function ImportAccessDescription() {
  const t = useTranslation();
  return t(resolveRuntimeOperatingSystem() === 'macos'
    ? 'desktop.importAccess.macHelp' : 'desktop.importAccess.help');
}

export function ImportPermissionSettingsButton() {
  const t = useTranslation();
  const [failed, setFailed] = useState(false);
  if (resolveRuntimeOperatingSystem() !== 'macos') return null;
  return <AppButton onClick={() => {
    void openImportPermissionSettings().catch(() => setFailed(true));
  }}>{t(failed ? 'desktop.importAccess.retrySettings' : 'desktop.importAccess.settings')}</AppButton>;
}
