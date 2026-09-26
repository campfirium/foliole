let generation = 0;
let scheduled = false;

export function resetDesktopSyncGroupRecovery() {
  generation += 1;
  scheduled = false;
}

export function scheduleDesktopSyncGroupRecovery(recover: () => void) {
  if (scheduled) return;
  scheduled = true;
  const current = generation;
  queueMicrotask(() => {
    if (current !== generation) return;
    scheduled = false;
    recover();
  });
}
