import { useState, type ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { requestToggleDismissedTopicVisibility } from '../shared/platform/runtime/dismissedTopicVisibilitySetting';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';
import { CompanionDirectoryBatchMenuProvider } from './CompanionDirectoryBatchMenu';
import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import { CompanionTopBar } from './CompanionTopBar';
import { CompanionWorkspaceActionsProvider } from './CompanionWorkspaceActions';

export const readBatchDirectorySnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

export function BatchDirectoryFixture({ initial, children }: { initial: WorkspaceSnapshot; children?: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selection, setSelection] = useState<CompanionDirectorySelection>({ kind: 'root' });
  return <CompanionWorkspaceActionsProvider snapshot={snapshot} flush={async () => {}} restoreFlow={() => {}}
    flowActive={false} applyFlow={async () => {}} refresh={async () => {
      const next = await readBatchDirectorySnapshot();
      setSnapshot(next);
      return next;
    }}>
    <CompanionDirectoryBatchMenuProvider>
      <CompanionTopBar title="Directory" visible rightSlot={<CompanionBrowseTopActions
        page={selection.kind === 'root' ? { kind: 'root' } : selection.kind === 'internal' ? { kind: 'folder', nodeId: selection.nodeId }
          : selection.kind === 'trash' || selection.kind === 'trashFolder' ? { kind: 'trash' } : { kind: 'other' }}
        onChangeSortDirection={() => {}} onChangeSortKey={() => {}}
        onOpenCapture={() => {}} sortDirection="asc" sortKey="name" />} />
      <button type="button" onClick={() => setSelection({ kind: 'root' })}>Library root</button>
      <button type="button" onClick={requestToggleDismissedTopicVisibility}>Toggle Topic Focus</button>
      <CompanionDirectoryContent selection={selection} onChangeSelection={setSelection} onExitArticle={setSelection}
        onSelectNode={() => {}} snapshot={snapshot} sortDirection="asc" sortKey="name" />
      {children}
    </CompanionDirectoryBatchMenuProvider>
  </CompanionWorkspaceActionsProvider>;
}
