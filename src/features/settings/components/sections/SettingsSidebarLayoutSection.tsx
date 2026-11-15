import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { onMainWindowResized, queryWindowSidebarLayoutMetrics } from '../../../../shared/platform/windowControls';
import { SettingsRow, SettingsSection } from '../../../../shared/ui';

export function SettingsSidebarLayoutSection() {
  const t = useTranslation();
  const [windowPercent, setWindowPercent] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      const metrics = await queryWindowSidebarLayoutMetrics().catch(() => null);
      if (!mounted || request !== revision) return;
      setWindowPercent(metrics ? 100 * metrics.windowWidth / metrics.workAreaWidth : null);
    };
    const subscription = onMainWindowResized(() => { void refresh(); });
    void refresh();
    return () => {
      mounted = false;
      void subscription.then(unlisten => unlisten?.());
    };
  }, []);

  if (windowPercent === null) return null;
  return (
    <SettingsSection ariaLabel={t('settings.appearance.sidebarLayout.title')} title={t('settings.appearance.sidebarLayout.title')}>
      <SettingsRow title={t('settings.appearance.sidebarLayout.windowWidth')}>
        <output>{Math.round(windowPercent)}%</output>
      </SettingsRow>
    </SettingsSection>
  );
}
