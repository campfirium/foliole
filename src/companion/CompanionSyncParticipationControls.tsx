import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  loadCompanionSyncGroupProviderState,
  setCompanionSyncEnabled,
  setCompanionSyncPaused
} from '../shared/platform/companion/sync/syncGroupProvider';
import type { CompanionSyncGroupProviderState } from '../shared/platform/companionWorkspaceSyncPluginTypes';

export function CompanionSyncParticipationControls() {
  const t = useTranslation();
  const [state, setState] = useState<CompanionSyncGroupProviderState | null>(null);
  const refresh = useCallback(() => {
    void loadCompanionSyncGroupProviderState().then(setState).catch(() => setState(null));
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const syncEnabled = state?.sync_enabled ?? false;
  const syncPaused = state?.sync_paused ?? false;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-companion-content px-4 py-3">
      <span className="text-sm font-semibold text-foreground">{t('companion.sync.participation.sync')}</span>
      <div className="flex gap-2">
        <button className="rounded-xl border border-companion-divider px-3 py-2 text-sm font-semibold"
          data-testid="companion-sync-toggle" disabled={!state}
          onClick={() => void setCompanionSyncEnabled(!syncEnabled).then(refresh)} type="button">
          {t(syncEnabled ? 'companion.sync.participation.turnOff' : 'companion.sync.participation.turnOn')}
        </button>
        <button className="rounded-xl border border-companion-divider px-3 py-2 text-sm font-semibold"
          data-testid="companion-sync-pause-toggle" disabled={!state}
          onClick={() => void setCompanionSyncPaused(!syncPaused).then(refresh)} type="button">
          {t(syncPaused ? 'companion.sync.participation.resume' : 'companion.sync.participation.pause')}
        </button>
      </div>
    </div>
  );
}
