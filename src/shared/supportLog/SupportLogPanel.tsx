import { useEffect, useState, useSyncExternalStore } from 'react';

import { useTranslation } from '../localization/LocalizationProvider';
import {
  getSupportLogState, startSupportLog, stopSupportLog, subscribeSupportLog
} from '../platform/supportLog/supportLog';
import { exportSupportLog } from '../platform/supportLog/supportLogExport';
import { AppButton } from '../ui/Button';

function useElapsedSeconds(startedAt: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return Math.min(300, Math.max(0, Math.floor((now - startedAt) / 1000)));
}

export function SupportLogPanel({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslation();
  const state = useSyncExternalStore(subscribeSupportLog, getSupportLogState);
  const seconds = useElapsedSeconds(state.startedAt);
  const recording = state.phase === 'recording';
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportFailed(false);
    try {
      setExportFailed(!await exportSupportLog(mobile));
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  }

  return <div className={mobile ? 'space-y-3 px-4 py-4' : 'space-y-3'}>
    {recording ? <div className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="size-2 rounded-full bg-error" />
      <span role="status">{t('supportLog.recording')}</span>
      <span className="ml-auto tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
    </div> : null}
    <p className="text-sm text-foreground/70">{t(state.phase === 'ready' ? 'supportLog.ready'
      : recording ? 'supportLog.instructions' : 'supportLog.intro')}</p>
    <div className={mobile ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
      <AppButton type="button" variant="emphasis" className={mobile ? 'min-h-11' : undefined}
        disabled={exporting} onClick={() => {
          setExportFailed(false);
          if (recording) stopSupportLog();
          else startSupportLog();
        }}>
        {t(recording ? 'supportLog.stop' : 'supportLog.start')}
      </AppButton>
      <AppButton type="button" className={mobile ? 'min-h-11' : undefined}
        disabled={state.phase !== 'ready' || exporting} onClick={() => void handleExport()}>
        {t('supportLog.export')}
      </AppButton>
    </div>
    {exportFailed ? <p role="alert" className="text-sm">{t('supportLog.exportFailed')}</p> : null}
    <p className="text-xs text-foreground/65">{t('supportLog.privacy')}</p>
  </div>;
}
