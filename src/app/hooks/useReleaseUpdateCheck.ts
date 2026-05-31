import { useEffect, useRef } from 'react';

import {
  checkForFolioleUpdates,
  getNextUpdateCheckDelayMs
} from '../../shared/platform/updateCheck';

const MIN_SCHEDULE_DELAY_MS = 60 * 1000;

export function useReleaseUpdateCheck() {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    const clearScheduledCheck = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleNextCheck = () => {
      clearScheduledCheck();
      const delayMs = Math.max(MIN_SCHEDULE_DELAY_MS, getNextUpdateCheckDelayMs());
      timerRef.current = window.setTimeout(() => {
        void runCheck();
      }, delayMs);
    };

    const runCheck = async () => {
      await checkForFolioleUpdates({ notify: true });
      if (!disposed) scheduleNextCheck();
    };

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void runCheck();
      }
    };

    void runCheck();
    window.addEventListener('focus', runCheck);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      disposed = true;
      clearScheduledCheck();
      window.removeEventListener('focus', runCheck);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [timerRef]);
}
