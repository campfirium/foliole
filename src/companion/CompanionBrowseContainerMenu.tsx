import { ChevronRight } from 'lucide-react';

import { readDiveNode } from '../../lib/core/nodes/dive';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { useDirectoryConversionMenu } from './CompanionDirectoryConversionMenu';
import { CompanionMenuRow } from './CompanionMenuSheet';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceMenuActions, getCompanionWorkspaceMenuOptions } from './CompanionWorkspaceMenuActions';
import type { WorkspaceNodeSheetState } from './CompanionWorkspaceNodeSheet';

/** The page the top-right menu belongs to; menu items act on this container or its list. */
export type CompanionBrowsePage =
  | { kind: 'root' }
  | { kind: 'folder'; nodeId: string }
  | { kind: 'dive'; nodeId: string }
  | { kind: 'trash' }
  | { kind: 'recent' }
  | { kind: 'other' };

const sectionClass = 'px-1 pt-4 pb-1 text-xs font-medium text-companion-text-tertiary [overflow-wrap:anywhere]';

function useContainerNode(nodeId: string) {
  const workspace = useCompanionWorkspaceActions();
  const { locale, t } = useLocalization();
  const node = workspace?.snapshot?.nodesById[nodeId];
  const ready = Boolean(workspace && node && !node.deletedAt && isAvailableNativeCompanionRuntime());
  return { workspace, node, ready, title: node ? resolveNodeDisplayTitle(locale, node.id, node.title) || t('desktop.search.context.untitled') : '' };
}

export function useCompanionFolderCreateKinds(page: CompanionBrowsePage) {
  const workspace = useCompanionWorkspaceActions();
  const nodes = workspace?.snapshot?.nodesById;
  const node = page.kind === 'folder' ? nodes?.[page.nodeId] : undefined;
  if (!workspace || !nodes || !node || !isAvailableNativeCompanionRuntime()) return [];
  return getCompanionWorkspaceMenuOptions(node, nodes).childKinds;
}

export function CompanionFolderCreateChoices({ nodeId, onClose }: { nodeId: string; onClose(): void }) {
  const workspace = useCompanionWorkspaceActions();
  const { t } = useLocalization();
  const kinds = useCompanionFolderCreateKinds({ kind: 'folder', nodeId });
  if (!workspace) return null;
  return <>{kinds.map(kind => <CompanionMenuRow key={kind} disabled={workspace.busy || workspace.pending}
    label={t(kind === 'folder' ? 'desktop.command.createFolder' : kind === 'topic' ? 'desktop.command.createTopic' : 'desktop.command.createItem')}
    onSelect={() => {
      onClose();
      workspace.open({ mode: 'create', nodeId: null, parentNodeId: nodeId, kind });
    }} />)}</>;
}

function FolderSection({ nodeId, onClose }: { nodeId: string; onClose(): void }) {
  const { workspace, ready, title } = useContainerNode(nodeId);
  if (!ready || !workspace) return null;
  const open = (state: WorkspaceNodeSheetState) => {
    onClose();
    workspace.open(state);
  };
  return <>
    <div className={sectionClass}>{title}</div>
    <CompanionWorkspaceMenuActions nodeId={nodeId} menuRows hideCreate onSelect={open} />
  </>;
}

function DiveSection({ nodeId, onClose }: { nodeId: string; onClose(): void }) {
  const { workspace, node, ready, title } = useContainerNode(nodeId);
  const { t } = useLocalization();
  const menu = useDirectoryConversionMenu({ nodeId, enabled: ready });
  if (!ready || !workspace || !readDiveNode(node)) return null;
  const disabled = workspace.busy || workspace.pending;
  const open = (mode: WorkspaceNodeSheetState['mode']) => {
    onClose();
    workspace.open({ mode, nodeId, parentNodeId: null });
  };
  return <>
    <div className={sectionClass}>{title}</div>
    <CompanionMenuRow disabled={disabled} label={t('desktop.command.rename')} onSelect={() => open('rename')} />
    {menu?.target === 'index' && <CompanionMenuRow disabled={disabled} label={t('desktop.nodeList.dive.convertToIndex')}
      onSelect={() => open('convert-to-index')} />}
    <CompanionMenuRow destructive disabled={disabled} label={t('companion.workspace.delete')} onSelect={() => open('delete')} />
  </>;
}

/** Menu rows that change what the current container holds, placed before list-level rows. */
export function CompanionBrowseContainerActions({ page, onClose, onOpenCreate }: {
  page: CompanionBrowsePage; onClose(): void; onOpenCreate(): void;
}) {
  const workspace = useCompanionWorkspaceActions();
  const { t } = useLocalization();
  const createKinds = useCompanionFolderCreateKinds(page);
  if ((page.kind === 'folder' && createKinds.length) || (page.kind === 'root' && workspace && isAvailableNativeCompanionRuntime())) {
    return <CompanionMenuRow label={t('companion.browse.createHere')} onSelect={onOpenCreate} trailingIcon={ChevronRight} />;
  }
  if (page.kind === 'dive' && workspace && isAvailableNativeCompanionRuntime()) {
    return <CompanionMenuRow disabled={workspace.busy || workspace.pending} label={t('companion.browse.addDiveSource')}
      onSelect={() => {
        onClose();
        workspace.open({ mode: 'add-dive-source', nodeId: page.nodeId, parentNodeId: null });
      }} />;
  }
  return null;
}

/** The section named after the current container: actions on the container itself. */
export function CompanionBrowseContainerSection({ page, onClose }: { page: CompanionBrowsePage; onClose(): void }) {
  if (page.kind === 'folder') return <FolderSection nodeId={page.nodeId} onClose={onClose} />;
  if (page.kind === 'dive') return <DiveSection nodeId={page.nodeId} onClose={onClose} />;
  return null;
}
