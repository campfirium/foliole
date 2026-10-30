import { useRef, useState } from 'react';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { resolveTopicCreationParentId } from '../features/nodes/model/topicCreationParent';

import { createCompanionCaptureTextSaveHandler } from './companionCaptureTextController';
import type { CompanionDirectorySelection } from './CompanionDirectoryModel';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function useCompanionCaptureController(args: {
  directorySelection: CompanionDirectorySelection;
  isBrowseDirectoryOpen: boolean;
  setIsBrowseDirectoryOpen(open: boolean): void;
  surface: Pick<ReturnType<typeof useCompanionArticleSurface>, 'browsedFolder' | 'handleSelectBrowseNode'>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const [isCaptureSheetOpen, setOpen] = useState(false);
  const [parentNodeId, setParentNodeId] = useState(INBOX_NODE_ID);
  const latest = useRef(args);
  latest.current = args;
  const setIsCaptureSheetOpen = (open: boolean) => {
    if (open && !isCaptureSheetOpen) {
      const candidate = args.isBrowseDirectoryOpen
        ? args.directorySelection.kind === 'internal' ? args.directorySelection.nodeId : null
        : args.surface.browsedFolder?.nodeId ?? null;
      setParentNodeId(resolveTopicCreationParentId(candidate, args.workspaceSync.state.workspace_snapshot?.nodesById ?? {}));
    }
    setOpen(open);
  };
  const handleOpenCapturedNode = (nodeId: string) => {
    latest.current.setIsBrowseDirectoryOpen(false);
    latest.current.surface.handleSelectBrowseNode(nodeId);
  };
  return { isCaptureSheetOpen, setIsCaptureSheetOpen, handleOpenCapturedNode,
    handleSaveCaptureText: createCompanionCaptureTextSaveHandler(args.workspaceSync, parentNodeId) };
}
