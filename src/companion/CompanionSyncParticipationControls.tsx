import { useTranslation } from '../shared/localization/LocalizationProvider';
import { setCompanionSyncEnabled } from '../shared/platform/companion/sync/syncGroupProvider';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../shared/ui';

import { useCompanionSyncParticipation } from './useCompanionSyncParticipation';

export function CompanionSyncParticipationControls() {
  const t = useTranslation();
  const state = useCompanionSyncParticipation();
  const syncEnabled = state.sync_enabled;
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-y border-companion-divider px-1 py-2 text-foreground">
      <span className="text-sm font-semibold text-foreground">{t('companion.sync.participation.sync')}</span>
      <button aria-checked={syncEnabled} aria-label={t('companion.sync.participation.sync')}
        className={settingsSwitchClassName(syncEnabled, "before:absolute before:-inset-y-3 before:inset-x-0 before:content-['']")}
        data-testid="companion-sync-toggle"
        onClick={() => void setCompanionSyncEnabled(!syncEnabled)} role="switch" type="button">
        <span aria-hidden="true" className={settingsSwitchKnobClassName(syncEnabled)} />
      </button>
    </div>
  );
}
