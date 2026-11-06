import { useEffect, useMemo, useRef, useState } from 'react';

import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import {
  releaseWorkspaceEditorBase,
  retainWorkspaceEditorBase
} from '../../shared/platform/workspaceRuntimeDocumentRepository';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
import { subscribeContentEditAcknowledgements } from '../../store/workspaceContentEditAcknowledgements';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

type EditorBase = { content: string; versionId: string | null | undefined };
type Hold = { id: string; promise: Promise<void>; retained: boolean; releasing: boolean };
type Session = {
  nodeId: string | null;
  accepted: EditorBase | null;
  holds: Map<string, Hold>;
  disposed: boolean;
};
type Args = EditorBase & {
  nodeId: string | null;
  flushDraft: () => boolean;
  readDraftBaseVersionId?: (nodeId: string) => string | null | undefined;
  settleBufferedInput?: (nodeId: string) => Promise<void>;
};

function reportProtectionError(error: unknown) {
  logRuntimeError('editor base protection failed', { area: 'persistence', action: 'editor_base_hold', error });
}

function needsHold(session: Session, versionId: string, args: Args) {
  if (session.disposed) return false;
  const successor = session.accepted?.versionId;
  // Saved receipts inherit protection under the old hold until a direct successor hold exists.
  if (successor && !session.holds.get(successor)?.retained) return true;
  return versionId === successor || (args.nodeId === session.nodeId && versionId === args.versionId)
    || Boolean(session.nodeId && versionId === args.readDraftBaseVersionId?.(session.nodeId));
}

async function releaseUnusedHold(session: Session, versionId: string, hold: Hold, readArgs: () => Args) {
  if (!session.nodeId || hold.releasing || needsHold(session, versionId, readArgs())) return;
  hold.releasing = true;
  try {
    await hold.promise.catch(() => undefined);
    if (session.disposed) {
      await readArgs().settleBufferedInput?.(session.nodeId);
      const readDraftBase = readArgs().readDraftBaseVersionId;
      if (!readDraftBase || readDraftBase(session.nodeId) != null) readArgs().flushDraft();
    }
    if (!await drainPendingNodeContentRuntimePersist(session.nodeId)
      || needsHold(session, versionId, readArgs())) return;
    await releaseWorkspaceEditorBase(session.nodeId, hold.id);
    session.holds.delete(versionId);
  } catch (error) { reportProtectionError(error); }
  finally { hold.releasing = false; }
}

/** Only expose a new edit basis once held, without interrupting the previous editor session. */
export function useWorkspaceEditorBaseHold(args: Args) {
  const latest = useRef(args);
  latest.current = args;
  const session = useMemo<Session>(() => ({ nodeId: args.nodeId, accepted: null,
    holds: new Map(), disposed: false }), [args.nodeId]);
  const [, notifyRetained] = useState(0);
  const readArgs = () => latest.current;
  useEffect(() => subscribeContentEditAcknowledgements(event => {
    if (event.nodeId !== session.nodeId) return;
    if (event.type === 'created') {
      // A creation has no inherited alternatives, and topic history retains its identity.
      if (!latest.current.versionId) session.accepted = { content: latest.current.content, versionId: event.versionId };
    } else if (session.accepted?.versionId === event.baseVersionId) {
      session.accepted = { content: event.submittedContent, versionId: event.submittedVersionId };
    }
  }), [session]);
  useEffect(() => {
    if (!args.nodeId || !args.versionId || !hasWorkspaceRuntimeRepository()) return;
    const versionId = args.versionId;
    if (session.holds.has(versionId)) return;
    const hold: Hold = { id: `desktop:${crypto.randomUUID()}`, promise: Promise.resolve(), retained: false, releasing: false };
    session.holds.set(versionId, hold);
    hold.promise = retainWorkspaceEditorBase(args.nodeId, versionId, hold.id).then(() => {
      hold.retained = true;
      if (!session.disposed && latest.current.nodeId === session.nodeId && latest.current.versionId === versionId) {
        session.accepted = { content: latest.current.content, versionId };
        notifyRetained(value => value + 1);
      }
    });
    void hold.promise.catch(reportProtectionError);
  }, [args.nodeId, args.versionId, session]);
  useEffect(() => {
    for (const [versionId, hold] of session.holds) void releaseUnusedHold(session, versionId, hold, readArgs);
  });
  useEffect(() => {
    session.disposed = false;
    return () => {
      session.disposed = true;
      for (const [versionId, hold] of session.holds) void releaseUnusedHold(session, versionId, hold, readArgs);
    };
  }, [session]);
  const native = hasWorkspaceRuntimeRepository();
  const source = { content: args.content, versionId: args.versionId };
  if (!args.versionId || !native || session.accepted?.versionId === args.versionId
    || Boolean(args.versionId && session.holds.get(args.versionId)?.retained)) session.accepted = source;
  return { ready: !args.nodeId || !args.versionId || !native || session.accepted !== null,
    document: session.accepted ?? source };
}
