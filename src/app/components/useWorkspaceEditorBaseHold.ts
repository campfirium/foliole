import { useEffect, useMemo, useRef, useState } from 'react';

import {
  releaseWorkspaceEditorBase,
  retainWorkspaceEditorBase
} from '../../shared/platform/workspaceRuntimeDocumentRepository';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
import { isAcknowledgedContentSuccessor } from '../../store/workspaceContentEditAcknowledgements';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

/** Keep a draft's original merge base readable while sync can move the node head. */
export function useWorkspaceEditorBaseHold(args: {
  flushDraft: () => boolean;
  nodeId: string | null;
  versionId: string | null | undefined;
}) {
  const flushRef = useRef(args.flushDraft);
  flushRef.current = args.flushDraft;
  const session = useMemo(() => crypto.randomUUID(), [args.nodeId]);
  const [ready, setReady] = useState<{ token: string | null; session: string; versionId: string } | null>(null);
  const latestRetained = useRef<{ session: string; promise: Promise<void> } | null>(null);
  const key = args.nodeId && args.versionId ? `${args.nodeId}\u0000${args.versionId}` : null;
  const token = useMemo(() => key ? crypto.randomUUID() : null, [key]);
  useEffect(() => {
    if (!args.nodeId || !args.versionId || !hasWorkspaceRuntimeRepository()) return;
    const nodeId = args.nodeId;
    const holdId = `desktop:${crypto.randomUUID()}`;
    let retired = false;
    const versionId = args.versionId;
    const retained = retainWorkspaceEditorBase(nodeId, versionId, holdId);
    latestRetained.current = { session, promise: retained };
    void retained.then(() => {
      if (!retired) setReady({ token, session, versionId });
    }).catch(() => undefined);
    return () => {
      retired = true;
      flushRef.current();
      void retained.then(async () => {
        // The successor must own protection before the previous hold is released.
        const successor = latestRetained.current;
        if (successor?.session === session) await successor.promise;
        if (await drainPendingNodeContentRuntimePersist(nodeId)) {
          await releaseWorkspaceEditorBase(nodeId, holdId);
        }
      }).catch(() => undefined);
    };
  }, [args.nodeId, args.versionId, session, token]);
  const heldSuccessor = ready?.session === session && args.nodeId && args.versionId
    && isAcknowledgedContentSuccessor(args.nodeId, ready.versionId, args.versionId);
  return !key || !hasWorkspaceRuntimeRepository() || ready?.token === token || Boolean(heldSuccessor);
}
