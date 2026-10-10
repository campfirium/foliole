import { useEffect, useState } from 'react';

import type { ForegroundTimeHistory } from '../../../../lib/platform/nativeForegroundTimeContract';
import { readNativeAppActiveState, subscribeNativeAppBackground, subscribeNativeAppForeground } from '../../../shared/platform/appLifecycle';
import { isNativeCompanionRuntime } from '../../../shared/platform/companionBootstrap';
import { loadForegroundTimeHistoryFromRuntime } from '../../../shared/platform/desktop/foregroundTimeRuntimeRepository';

export function useForegroundTimeHistory(fromDay: string, toDay: string, today: string) {
  const [history, setHistory] = useState<ForegroundTimeHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    setHistory(null);
    const load = () => {
      void loadForegroundTimeHistoryFromRuntime({ fromDay, toDay }).then((value) => {
        if (!disposed) { setHistory(value); setFailed(false); }
      }, () => { if (!disposed) setFailed(true); });
    };
    load();
    let timer: number | null = null;
    const unsubscribes: (() => void)[] = [];
    const setActive = (active: boolean) => {
      if (disposed) return;
      if (timer !== null) window.clearInterval(timer);
      timer = active ? window.setInterval(load, 60_000) : null;
      if (active) load();
    };
    const focus = () => setActive(true);
    const blur = () => setActive(false);
    if (isNativeCompanionRuntime()) {
      void Promise.all([subscribeNativeAppForeground(focus), subscribeNativeAppBackground(blur)]).then(async (handles) => {
        if (disposed) { handles.forEach((unsubscribe) => unsubscribe()); return; }
        unsubscribes.push(...handles);
        setActive(await readNativeAppActiveState());
      }).catch(() => { if (!disposed) setFailed(true); });
    } else {
      setActive(document.hasFocus());
      window.addEventListener('focus', focus);
      window.addEventListener('blur', blur);
    }
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
    };
  }, [fromDay, toDay, retry]);
  function duration(day: string) {
    if (day > today) return null;
    if (!history || failed || day < history.coverageFrom) return null;
    return history.days.find((entry) => entry.day === day)?.durationMs ?? 0;
  }
  return { duration, totalDurationMs: history && !failed ? history.totalDurationMs : null,
    failed, retry: () => setRetry((value) => value + 1) };
}
