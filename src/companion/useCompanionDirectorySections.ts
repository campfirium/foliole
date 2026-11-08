import { useMemo } from 'react';

import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { FolderListSortDirection, FolderListSortKey } from '../features/nodes/model/folderListOrdering';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveCompanionBrowseSnapshot } from '../shared/platform/companion/browse/companionBrowseSnapshot';
import { applyCompanionFolderTopicFocus } from '../shared/platform/companion/browse/companionTopicFocus';
import {
  resolveCompanionFolderViewByNodeId, resolveCompanionRootDirectoryView,
  resolveCompanionTrashFolderViewByNodeId, resolveCompanionTrashView
} from '../shared/platform/companionBrowseLists';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';
import { useDismissedTopicVisibility } from '../shared/platform/runtime/useDismissedTopicVisibility';

import { resolveDirectorySections, type CompanionDirectorySelection } from './CompanionDirectoryModel';
import { resolveCompanionDiveSections } from './companionDiveDirectory';

export function useCompanionDirectorySections(args: {
  directory: CompanionExternalDirectory;
  selection: CompanionDirectorySelection;
  snapshot: WorkspaceSnapshot | null;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const { viewHideDismissedTopics } = useDismissedTopicVisibility();
  const { locale } = useLocalization();
  const snapshot = resolveCompanionBrowseSnapshot(args.snapshot);
  const { directory, selection, sortKey, sortDirection } = args;
  const selectionKey = JSON.stringify(selection);
  const sections = useMemo(() => {
    const selected = JSON.parse(selectionKey) as CompanionDirectorySelection;
    const current = selected.kind === 'virtual' && selected.nodeId === VIRTUAL_ROOT_NODE_ID
      ? { kind: 'root' } as const : selected;
    const diveSections = resolveCompanionDiveSections(snapshot, current);
    if (diveSections) return diveSections;
    const folderView = current.kind === 'internal' || current.kind === 'virtual'
      ? resolveCompanionFolderViewByNodeId(snapshot, current.nodeId, sortKey, sortDirection) : null;
    const trashView = current.kind === 'trashFolder'
      ? resolveCompanionTrashFolderViewByNodeId(snapshot, current.nodeId, sortKey, sortDirection)
      : current.kind === 'trash' ? resolveCompanionTrashView(snapshot, sortKey, sortDirection) : null;
    const needsRoot = current.kind === 'root' || (!folderView && (current.kind === 'internal' || current.kind === 'virtual'));
    return resolveDirectorySections({ directory, selection: current, snapshot,
      folderView: viewHideDismissedTopics ? applyCompanionFolderTopicFocus(snapshot, folderView) : folderView,
      virtualRootView: needsRoot && snapshot?.nodesById[VIRTUAL_ROOT_NODE_ID]
        ? resolveCompanionFolderViewByNodeId(snapshot, VIRTUAL_ROOT_NODE_ID, sortKey, sortDirection) : null,
      rootView: needsRoot ? resolveCompanionRootDirectoryView(snapshot, sortKey, sortDirection) : { items: [] },
      ...(trashView ? { trashView } : {}) });
  }, [directory, selectionKey, snapshot, sortDirection, sortKey, locale, viewHideDismissedTopics]);
  return { sections };
}
