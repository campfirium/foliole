export const companionActivityKinds = ['sync', 'folder-backup', 'workspace-refresh', 'read-intent', 'predict-next',
  'native.resolve-resource', 'native.write-image', 'native.read-remote-image'] as const;

export type CompanionActivityKind = typeof companionActivityKinds[number];
type ActivityTiming = { kind: CompanionActivityKind; startedAt: number };
export type ActivityCompletion = { status: 'done' | 'failed'; queueMs?: number; runMs?: number };
type CompletionObserver = (timing: ActivityTiming, completion: ActivityCompletion) => void;

const activeTimings = new Set<ActivityTiming>();
const observers = new Set<CompletionObserver>();

export function subscribeCompanionActivityTimings(observer: CompletionObserver) {
  observers.add(observer);
  return () => { observers.delete(observer); };
}

export function pendingCompanionActivityTimings() {
  return [...activeTimings];
}

/** Publishes when background work ran; the work itself never depends on an observer. */
export async function timeCompanionActivity<T>(kind: CompanionActivityKind, task: () => Promise<T>,
  measure?: (result: T) => Omit<ActivityCompletion, 'status'>) {
  const timing = { kind, startedAt: performance.now() };
  activeTimings.add(timing);
  let completion: ActivityCompletion = { status: 'failed' };
  try {
    const result = await task();
    completion = { status: 'done', ...(measure && observers.size ? measure(result) : {}) };
    return result;
  } finally {
    activeTimings.delete(timing);
    for (const observer of observers) observer(timing, completion);
  }
}
