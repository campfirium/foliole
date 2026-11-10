import { useEffect, useRef } from 'react';

import { readDiveNode } from '../../lib/core/nodes/dive';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { useCompanionNavigationField } from './CompanionNavigationProvider';
import type { useCompanionFlowSession } from './useCompanionFlowSession';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function useExitUnavailableDive(flow: ReturnType<typeof useCompanionFlowSession>, activeAction: CompanionTabAction,
  workspaceSync: Pick<ReturnType<typeof useCompanionWorkspaceSync>, 'state' | 'isWorkspaceSyncStateReady'>,
  actions: { handleExitFlowHere: (nodeId: string) => void; handleTabAction: (action: CompanionTabAction) => void }) {
  const snapshot = workspaceSync.state.workspace_snapshot;
  const unavailable = activeAction === 'review' && workspaceSync.isWorkspaceSyncStateReady &&
    Boolean(snapshot && flow.dive && (!readDiveNode(snapshot.nodesById[flow.dive.id]) ||
      !isCanonicalVisibleNodeId(snapshot, flow.dive.id)));
  const current = flow.view.currentCard?.nodeId;
  const [, setDirectoryOpen] = useCompanionNavigationField('isBrowseDirectoryOpen', false);
  const [, setDirectorySelection] = useCompanionNavigationField('directorySelection', { kind: 'root' });
  const last = useRef<{ diveId: string | undefined; nodeId: string | undefined }>({ diveId: undefined, nodeId: undefined });
  useEffect(() => {
    if (last.current.diveId !== flow.dive?.id || current) last.current = { diveId: flow.dive?.id, nodeId: current };
    if (!unavailable || current) return;
    flow.exitUnavailableDive();
    const lastNodeId = last.current.nodeId;
    const returnToMaterial = lastNodeId && snapshot && isCanonicalVisibleNodeId(snapshot, lastNodeId);
    setDirectoryOpen(!returnToMaterial);
    if (returnToMaterial) actions.handleExitFlowHere(lastNodeId);
    else {
      setDirectorySelection({ kind: 'root' });
      actions.handleTabAction('recent');
    }
  }, [actions, current, flow, setDirectoryOpen, setDirectorySelection, snapshot, unavailable]);
}
