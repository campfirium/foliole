import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  loadCompanionSyncGroupProviderState,
  setCompanionSyncEnabled
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
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-y border-companion-divider px-1 py-2 text-foreground">
      <span className="text-sm font-semibold text-foreground">{t('companion.sync.participation.sync')}</span>
      <button aria-checked={syncEnabled} aria-label={t('companion.sync.participation.sync')}
        className={`flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition ${syncEnabled ? 'justify-end bg-companion-accent' : 'justify-start bg-companion-divider-strong'}`}
        data-testid="companion-sync-toggle" disabled={!state}
        onClick={() => void setCompanionSyncEnabled(!syncEnabled).then(refresh)} role="switch" type="button">
        <span aria-hidden="true" className="h-5 w-5 rounded-full bg-canvas shadow-marker" />
      </button>
    </div>
  );
}
