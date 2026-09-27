import { useEffect, useMemo, useRef, useState } from 'react';

import {
  releaseWorkspaceEditorBase,
  retainWorkspaceEditorBase
} from '../../shared/platform/workspaceRuntimeDocumentRepository';
import { hasWorkspaceRuntimeRepository } from '../../shared/platform/workspaceRuntimeRepository';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

/** Keep a draft's original merge base readable while sync can move the node head. */
export function useWorkspaceEditorBaseHold(args: {
  flushDraft: () => boolean;
  nodeId: string | null;
  versionId: string | null | undefined;
}) {
  const flushRef = useRef(args.flushDraft);
  flushRef.current = args.flushDraft;
  const [readyToken, setReadyToken] = useState<string | null>(null);
  const key = args.nodeId && args.versionId ? `${args.nodeId}\u0000${args.versionId}` : null;
  const token = useMemo(() => key ? crypto.randomUUID() : null, [key]);
  useEffect(() => {
    if (!args.nodeId || !args.versionId || !hasWorkspaceRuntimeRepository()) return;
    const nodeId = args.nodeId;
    const holdId = `desktop:${crypto.randomUUID()}`;
    let retired = false;
    const retained = retainWorkspaceEditorBase(nodeId, args.versionId, holdId);
    void retained.then(() => {
      if (!retired) setReadyToken(token);
    }).catch(() => undefined);
    return () => {
      retired = true;
      flushRef.current();
      void retained.then(async () => {
        if (await drainPendingNodeContentRuntimePersist(nodeId)) {
          await releaseWorkspaceEditorBase(nodeId, holdId);
        }
      }).catch(() => undefined);
    };
  }, [args.nodeId, args.versionId, token]);
  return !key || !hasWorkspaceRuntimeRepository() || readyToken === token;
}
