import { useEffect } from 'react';

import { runAttachmentMaintenance } from '../platform/attachments/attachmentMaintenance';

export function useAttachmentObservation(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>;
    let completedDay = '';
    let running: AbortController | undefined;
    let disposed = false;
    const schedule = () => {
      clearTimeout(timer);
      running?.abort();
      if (disposed || document.visibilityState !== 'visible' || completedDay === new Date().toDateString()) return;
      timer = setTimeout(() => {
        if (running) return;
        const controller = new AbortController();
        running = controller;
        let incomplete = false;
        void runAttachmentMaintenance({ action: 'observe' }, controller.signal)
          .then(result => {
            incomplete = result?.observationComplete === false;
            if (!controller.signal.aborted && !incomplete) completedDay = new Date().toDateString();
          })
          .catch((error: unknown) => {
            incomplete = true;
            if (!controller.signal.aborted) console.warn('[attachments] idle observation incomplete', error);
          })
          .finally(() => {
            running = undefined;
            if ((controller.signal.aborted || incomplete) && !disposed) schedule();
          });
      }, 60_000);
    };
    schedule();
    for (const event of ['focus', 'pointerdown', 'keydown']) window.addEventListener(event, schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      disposed = true;
      running?.abort(); clearTimeout(timer);
      for (const event of ['focus', 'pointerdown', 'keydown']) window.removeEventListener(event, schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [ready]);
}
