export const attachmentTimingKinds = ['observe', 'status', 'clean', 'empty-trash', 'restore', 'configure',
  'file.inventory', 'file.read-state', 'file.write-state', 'file.move', 'file.remove-trash', 'file.generation',
  'protected-write'] as const;

type AttachmentTimingKind = typeof attachmentTimingKinds[number];
type AttachmentTiming = { kind: AttachmentTimingKind; startedAt: number };
type CompletionObserver = (timing: AttachmentTiming, status: 'done' | 'failed') => void;

const activeTimings = new Set<AttachmentTiming>();
const observers = new Set<CompletionObserver>();

export function subscribeCompanionAttachmentTimings(observer: CompletionObserver) {
  observers.add(observer);
  return () => { observers.delete(observer); };
}

export function pendingCompanionAttachmentTimings() {
  return [...activeTimings];
}

export async function timeCompanionAttachment<T>(kind: string, task: () => Promise<T>) {
  const knownKind = attachmentTimingKinds.find(candidate => candidate === kind);
  if (!knownKind) return task();
  const timing = { kind: knownKind, startedAt: performance.now() };
  activeTimings.add(timing);
  let status: 'done' | 'failed' = 'failed';
  try {
    const result = await task();
    status = 'done';
    return result;
  } finally {
    activeTimings.delete(timing);
    for (const observer of observers) observer(timing, status);
  }
}
