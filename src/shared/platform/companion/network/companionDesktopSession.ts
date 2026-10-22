import { syncSessionReplySchema, type SyncSessionReply } from '../../../../../lib/platform/syncSessionContract.js';

import { requestCompanionSyncSession } from './companionSyncSessionHttp.js';
import type { CompanionWorkspaceSyncTarget } from './companionWorkspaceEndpoint.js';

type Binding = { target: CompanionWorkspaceSyncTarget; libraryEpoch: string };

type Session = { endpoint: string; peer: string; reply: SyncSessionReply; waiting: boolean; active: boolean;
  controller: AbortController; binding?: Binding };
let current: Session | null = null;
let opening: Promise<Session> | null = null;
let generation = 0;
let wake: (() => Promise<unknown>) | null = null;
// A higher-priority device this phone already tried to move to; repeated hints for it are ignored.
let followedHint: string | null = null;

export function companionDesktopSessionTarget(groupId: string) {
  return current?.active && current.binding?.target.groupId === groupId
    ? { ...current.binding.target } : null;
}

export function invalidateCompanionDesktopSession(endpoint: string) {
  if (current?.endpoint === endpoint) void closeCompanionDesktopSession();
}

export function companionDesktopSessionId(peer: string) { return current?.peer === peer ? current.reply.session : undefined; }

export async function recoverCompanionDesktopRound(peer: string, sessionId: string) {
  if (current?.peer !== peer || current.reply.session !== sessionId) return;
  await closeCompanionDesktopSession();
  void wake?.().catch(() => undefined);
}

export function captureCompanionDesktopRound(endpoint: string) {
  const session = current;
  if (!session || session.endpoint !== endpoint) return async () => {};
  const marker = session.reply.marker;
  return async () => {
    if (!session.active || current !== session) return;
    await requestCompanionSyncSession(endpoint, { operation: 'complete', session: session.reply.session, marker },
      session.controller.signal);
  };
}

export function subscribeCompanionDesktopChanges(onChange: () => Promise<unknown>) {
  wake = onChange;
  return () => { if (wake === onChange) wake = null; void closeCompanionDesktopSession(); };
}

export async function ensureCompanionDesktopSession(endpoint: string, peer: string, binding?: Binding) {
  if (current?.endpoint === endpoint && current.peer === peer
    && (!binding || current.binding?.libraryEpoch === binding.libraryEpoch)) {
    if (binding) current.binding = binding;
    return;
  }
  if (opening) { await opening; return ensureCompanionDesktopSession(endpoint, peer, binding); }
  if (current) void closeCompanionDesktopSession();
  const expected = generation;
  const work = open(endpoint, peer, expected);
  opening = work;
  try { current = await work; if (binding) current.binding = binding; }
  finally { if (opening === work) opening = null; }
}

async function open(endpoint: string, peer: string, expected: number): Promise<Session> {
  const reply = syncSessionReplySchema.parse(await requestCompanionSyncSession(endpoint, { operation: 'open' }));
  if (expected !== generation) {
    await requestCompanionSyncSession(endpoint, { operation: 'close', session: reply.session }).catch(() => undefined);
    throw new Error('sync_session_cancelled');
  }
  return { endpoint, peer, reply, waiting: false, active: true, controller: new AbortController() };
}

export function waitForCompanionDesktopChanges() {
  if (!wake) { void closeCompanionDesktopSession(); return; }
  const session = current;
  if (!session || session.waiting || !wake) return;
  session.waiting = true;
  void wait(session).finally(() => { session.waiting = false; });
}

async function wait(session: Session) {
  try {
    while (session.active && current === session && wake) {
      const reply = syncSessionReplySchema.parse(await requestCompanionSyncSession(session.endpoint, {
        operation: 'wait', session: session.reply.session, marker: session.reply.marker
      }, session.controller.signal));
      if (!session.active || current !== session) return;
      session.reply = reply;
      const better = reply.best?.device_id;
      if (better && better !== session.peer && better !== followedHint) {
        followedHint = better;
        await closeCompanionDesktopSession();
        await wake?.();
        return;
      }
      if (reply.changed) await wake?.();
    }
  } catch {
    if (session.active && current === session) {
      await closeCompanionDesktopSession();
      await wake?.();
    }
  }
}

export async function closeCompanionDesktopSession() {
  generation += 1;
  const previous = current;
  current = null;
  if (!previous) return;
  previous.active = false;
  previous.controller.abort(new Error('sync_session_cancelled'));
  await requestCompanionSyncSession(previous.endpoint, { operation: 'close', session: previous.reply.session })
    .catch(() => undefined);
}
