export interface SearchIndexInvalidationProcessingOptions {
  delayMs?: number;
}

let scheduler: ((options?: SearchIndexInvalidationProcessingOptions) => void) | null = null;

export function setSearchIndexInvalidationScheduler(
  nextScheduler: ((options?: SearchIndexInvalidationProcessingOptions) => void) | null
) {
  scheduler = nextScheduler;
}

export function requestSearchIndexInvalidationProcessing(options?: SearchIndexInvalidationProcessingOptions) {
  scheduler?.(options);
}
