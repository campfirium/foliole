import { SYNC_SESSION_WAIT_MS, type SyncChangeMarker } from '../../platform/syncSessionContract.js';

type Session = {
  id: string;
  controller: AbortController;
  foreignSequence: number;
  wake: (() => void) | null;
  expires: ReturnType<typeof setTimeout> | null;
  completed: Set<(marker: SyncChangeMarker) => void>;
};

/** Notification state belongs to one server lifetime, never to a durable data cursor. */
export function createSyncChangeSessions(instance: string, newId: () => string) {
  let sequence = 0;
  const sessions = new Map<string, Session>();
  const marker = (): SyncChangeMarker => ({ instance, sequence });
  function requireSession(peer: string, id: string) {
    const session = sessions.get(peer);
    if (!session || session.id !== id) throw new Error('sync_session_expired');
    if (session.expires) clearTimeout(session.expires);
    session.expires = setTimeout(() => close(peer, id), 60_000);
    return session;
  }
  function close(peer: string, id: string) {
    const session = requireSession(peer, id);
    sessions.delete(peer);
    if (session.expires) clearTimeout(session.expires);
    session.controller.abort(new Error('sync_session_expired'));
  }
  function open(peer: string) {
    const previous = sessions.get(peer);
    if (previous) close(peer, previous.id);
    const session: Session = { id: newId(), controller: new AbortController(), foreignSequence: sequence,
      wake: null, expires: null, completed: new Set() };
    sessions.set(peer, session);
    requireSession(peer, session.id);
    return { session: session.id, marker: marker(), changed: true };
  }
  function changed(sourceSession?: string) {
    sequence += 1;
    for (const session of sessions.values()) {
      if (session.id === sourceSession) continue;
      session.foreignSequence = sequence;
      session.wake?.();
    }
  }
  async function wait(peer: string, id: string, observed: SyncChangeMarker, signal: AbortSignal,
    timeoutMs = SYNC_SESSION_WAIT_MS) {
    const session = requireSession(peer, id);
    const combined = AbortSignal.any([signal, session.controller.signal]);
    combined.throwIfAborted();
    const hasChanges = () => observed.instance !== instance || observed.sequence < session.foreignSequence;
    if (!hasChanges()) await waitForChange(session, combined, timeoutMs);
    combined.throwIfAborted();
    return { session: id, marker: marker(), changed: hasChanges() };
  }
  return {
    open, close, changed, wait,
    hasSessions: () => sessions.size > 0,
    complete(peer: string, id: string, observed: SyncChangeMarker) {
      for (const listener of requireSession(peer, id).completed) listener(observed);
    },
    requestSync() {
      changed();
      return Promise.all([...sessions.values()].map(session => waitForCompletion(session, marker())))
        .then(results => results.length > 0 && results.every(Boolean));
    },
    signal: (peer: string, id: string) => requireSession(peer, id).controller.signal,
    closeAll() { for (const [peer, session] of sessions) close(peer, session.id); }
  };
}

function waitForCompletion(session: Session, requested: SyncChangeMarker) {
  return new Promise<boolean>(resolve => {
    const finish = (complete: boolean) => {
      session.completed.delete(completed);
      session.controller.signal.removeEventListener('abort', aborted);
      resolve(complete);
    };
    const completed = (observed: SyncChangeMarker) => {
      if (observed.instance === requested.instance && observed.sequence >= requested.sequence) finish(true);
    };
    const aborted = () => finish(false);
    session.completed.add(completed);
    session.controller.signal.addEventListener('abort', aborted, { once: true });
  });
}

function waitForChange(session: Session, signal: AbortSignal, timeoutMs: number) {
  if (session.wake) throw new Error('sync_session_wait_already_pending');
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      session.wake = null;
      resolve();
    };
    const abort = () => { finish(); reject(signal.reason); };
    const timer = setTimeout(finish, timeoutMs);
    session.wake = finish;
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
