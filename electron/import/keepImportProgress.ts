type KeepImportProgressPhase = 'indexing' | 'scanning' | 'writing' | 'source_completed';

export interface KeepImportProgressEvent {
  currentSourcePath: string | null;
  highlightProcessedCount?: number;
  highlightTotalCount?: number;
  importWriteElapsedMs?: number;
  indexFailedCount?: number;
  indexElapsedMs?: number;
  indexPendingCount?: number;
  indexProcessedCount?: number;
  indexTotalCount?: number;
  phase: KeepImportProgressPhase;
  sourceProcessedCount: number;
  sourceTotalCount: number;
}

export type KeepImportProgressSink = (event: KeepImportProgressEvent) => void;

export function countPreparedImportHighlights(input: {
  matchedHighlights?: unknown[];
  sourceProfile?: string;
  unmatchedHighlights?: unknown[];
}) {
  if (input.sourceProfile !== 'body_with_highlight_sidecar') {
    return 0;
  }
  return (input.matchedHighlights?.length ?? 0) + (input.unmatchedHighlights?.length ?? 0);
}

export function throwIfKeepImportAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('AbortError', 'AbortError');
  }
}

export function isKeepImportAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError');
}

export async function yieldKeepImportRunner(signal?: AbortSignal) {
  throwIfKeepImportAborted(signal);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  throwIfKeepImportAborted(signal);
}
