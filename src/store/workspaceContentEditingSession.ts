import { setWorkspaceContentEditingSession } from '../shared/platform/workspaceRuntimeDocumentRepository';
import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

export type WorkspaceContentEditingSession = {
  libraryScope: string;
  nodeId: string;
  sessionId: string;
  closing: boolean;
  failed: boolean;
  ready: Promise<void>;
};
const sessions = new Map<string, WorkspaceContentEditingSession>();
const keyFor = (scope: string, nodeId: string) => JSON.stringify([scope, nodeId]);

function sessionArgs(session: WorkspaceContentEditingSession, action: 'begin' | 'end') {
  return { action, libraryScope: session.libraryScope, nodeId: session.nodeId, sessionId: session.sessionId };
}

function registerSession(session: WorkspaceContentEditingSession) {
  session.failed = false;
  session.ready = setWorkspaceContentEditingSession(sessionArgs(session, 'begin')).then(result => {
    if (!result.changed) throw new Error('content_editing_library_changed');
  }).catch(error => { session.failed = true; throw error; });
  void session.ready.catch(() => undefined);
}

export function beginWorkspaceContentEditingSession(libraryScope: string | undefined, nodeId: string) {
  if (!libraryScope || !hasWorkspaceRuntimeRepository()) return null;
  const key = keyFor(libraryScope, nodeId);
  const previous = sessions.get(key);
  if (previous && !previous.closing && !previous.failed) return previous;
  const session: WorkspaceContentEditingSession = {
    libraryScope, nodeId, sessionId: crypto.randomUUID(), closing: false, failed: false,
    ready: Promise.resolve()
  };
  sessions.set(key, session);
  registerSession(session);
  return session;
}

export function readWorkspaceContentEditingSessionReady(libraryScope: string | undefined, nodeId: string) {
  const session = libraryScope ? sessions.get(keyFor(libraryScope, nodeId)) : undefined;
  if (session?.failed) registerSession(session);
  return session?.ready;
}

export async function endWorkspaceContentEditingSession(session: WorkspaceContentEditingSession) {
  const key = keyFor(session.libraryScope, session.nodeId);
  await session.ready;
  if (sessions.get(key) !== session) return false;
  const result = await setWorkspaceContentEditingSession(sessionArgs(session, 'end'));
  if (sessions.get(key) === session) sessions.delete(key);
  return result.changed;
}
