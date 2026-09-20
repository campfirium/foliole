import { useEffect } from 'react';

import { runAttachmentMaintenance } from '../platform/attachments/attachmentMaintenance';

export function useAttachmentObservation(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let completedDay = '';
    let running = false;
    const schedule = () => {
      clearTimeout(timer);
      if (running || document.visibilityState !== 'visible' || completedDay === new Date().toDateString()) return;
      timer = setTimeout(() => {
        running = true;
        void runAttachmentMaintenance({ action: 'observe' }, controller.signal)
          .then(() => { completedDay = new Date().toDateString(); })
          .catch((error: unknown) => console.warn('[attachments] idle observation incomplete', error))
          .finally(() => { running = false; });
      }, 60_000);
    };
    schedule();
    for (const event of ['focus', 'pointerdown', 'keydown']) window.addEventListener(event, schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      controller.abort(); clearTimeout(timer);
      for (const event of ['focus', 'pointerdown', 'keydown']) window.removeEventListener(event, schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [ready]);
}
