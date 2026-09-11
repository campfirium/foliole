import { useTranslation } from '../shared/localization/LocalizationProvider';
import { setCompanionSyncEnabled } from '../shared/platform/companion/sync/syncGroupProvider';

import { useCompanionSyncParticipation } from './useCompanionSyncParticipation';

export function CompanionSyncParticipationControls() {
  const t = useTranslation();
  const state = useCompanionSyncParticipation();
  const syncEnabled = state.sync_enabled;
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-y border-companion-divider px-1 py-2 text-foreground">
      <span className="text-sm font-semibold text-foreground">{t('companion.sync.participation.sync')}</span>
      <button aria-checked={syncEnabled} aria-label={t('companion.sync.participation.sync')}
        className={`flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition ${syncEnabled ? 'justify-end bg-companion-accent' : 'justify-start bg-companion-divider-strong'}`}
        data-testid="companion-sync-toggle"
        onClick={() => void setCompanionSyncEnabled(!syncEnabled)} role="switch" type="button">
        <span aria-hidden="true" className="h-5 w-5 rounded-full bg-canvas shadow-marker" />
      </button>
    </div>
  );
}
