let scheduler: (() => void) | null = null;

export function setSearchIndexInvalidationScheduler(nextScheduler: (() => void) | null) {
  scheduler = nextScheduler;
}

export function requestSearchIndexInvalidationProcessing() {
  scheduler?.();
}
