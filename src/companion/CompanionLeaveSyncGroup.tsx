import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

export function CompanionLeaveSyncGroup(props: { onLeave(): Promise<unknown> }) {
  const t = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  async function leave() {
    setLeaving(true); setErrorCode(null);
    try {
      await props.onLeave();
    } catch (error) {
      setLeaving(false);
      setErrorCode(error instanceof Error ? error.message : 'sync_group_departure_failed');
    }
  }
  return (
    <div className={confirming ? 'basis-full' : 'shrink-0'}>
      {!confirming ? (
        <button className="min-h-11 touch-manipulation rounded-md px-2 py-2 text-sm font-medium text-companion-text-secondary transition-colors active:bg-companion-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent"
          data-testid="companion-sync-group-leave" onClick={() => setConfirming(true)} type="button">
          {t('companion.sync.leave.button')}
        </button>
      ) : (
        <div className="border-t border-error/30 py-3">
          <p className="text-sm leading-6 text-companion-text-secondary">{t('companion.sync.leave.description')}</p>
          <div className="mt-3 flex gap-2">
            <button className="min-h-11 flex-1 touch-manipulation rounded-md border border-companion-divider px-3 py-2 text-sm font-semibold"
              disabled={leaving} onClick={() => setConfirming(false)} type="button">{t('common.cancel')}</button>
            <button className="min-h-11 flex-1 touch-manipulation rounded-md border border-error/60 px-3 py-2 text-sm font-semibold text-error"
              data-testid="companion-sync-group-leave-confirm" disabled={leaving}
              onClick={() => void leave()} type="button">
              {t(leaving ? 'companion.sync.leave.progress' : 'companion.sync.leave.button')}
            </button>
          </div>
          {errorCode ? <p className="mt-3 text-sm text-error" data-error-code={errorCode}
            data-testid="companion-sync-group-leave-error">{t('companion.sync.leave.error')}</p> : null}
        </div>
      )}
    </div>
  );
}
