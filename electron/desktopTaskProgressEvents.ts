interface ProgressEventState {
  completed: number | null;
  timestamp: number;
  total: number | null;
}

const PROGRESS_MIN_COMPLETED_STEP = 25;
const PROGRESS_MIN_INTERVAL_MS = 5000;

function asProgressCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function shouldWriteDesktopTaskProgressEvent(args: {
  now: number;
  previous: ProgressEventState | null;
  progress: Record<string, unknown>;
}) {
  const completed = asProgressCount(args.progress.completed);
  const total = asProgressCount(args.progress.total);
  const nextState = { completed, timestamp: args.now, total };
  if (!args.previous) return { nextState, shouldWrite: true };
  if (completed !== null && total !== null && completed >= total) return { nextState, shouldWrite: true };
  if (
    completed !== null &&
    args.previous.completed !== null &&
    completed - args.previous.completed >= PROGRESS_MIN_COMPLETED_STEP
  ) {
    return { nextState, shouldWrite: true };
  }
  return {
    nextState,
    shouldWrite: args.now - args.previous.timestamp >= PROGRESS_MIN_INTERVAL_MS
  };
}

export type DesktopTaskProgressEventState = ProgressEventState;
