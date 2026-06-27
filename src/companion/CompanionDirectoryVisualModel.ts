import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { Translate } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';
import { selectCanonicalTrashedNodeIds, selectCanonicalVisibleNodeIds } from '../shared/workspaceCanonicalSelectors';

import type { DirectoryListItem, DirectorySection } from './CompanionDirectoryModel';

function resolveBodyStatusLabel(item: DirectoryListItem, t: Translate) {
  const status = 'bodyStatus' in item ? item.bodyStatus : undefined;
  if (status === 'failed') return t('desktop.nodeBrowse.bodyUnavailable');
  if (status === 'empty') return t('desktop.nodeBrowse.emptyTopic');
  if (status === 'fetching' || status === 'missing') return t('companion.directory.row.syncing');
  return null;
}

export function resolveDirectoryItemCount(sections: DirectorySection[]) {
  return sections.reduce((count, section) => count + section.items.length, 0);
}

function countDirectChildren(snapshot: WorkspaceSnapshot | null, parentNodeId: string, mode: 'trash' | 'visible') {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot) return null;
  const nodeIds = mode === 'trash'
    ? selectCanonicalTrashedNodeIds(normalizedSnapshot)
    : selectCanonicalVisibleNodeIds(normalizedSnapshot);
  return nodeIds.filter((nodeId) => normalizedSnapshot.nodesById[nodeId]?.parentNodeId === parentNodeId).length;
}

function formatRowCount(count: number | null) {
  if (!count) return null;
  return String(count);
}

export function resolveDirectoryRowMeta(args: {
  directory: CompanionExternalDirectory;
  item: DirectoryListItem;
  snapshot: WorkspaceSnapshot | null;
}) {
  if (args.item.source === 'trashRoot') {
    const count = args.snapshot ? selectCanonicalTrashedNodeIds(normalizeWorkspaceSnapshot(args.snapshot)).length : null;
    return formatRowCount(count);
  }
  if (args.item.source === 'trash' && args.item.kind === 'folder') {
    const count = countDirectChildren(args.snapshot, args.item.nodeId, 'trash');
    return formatRowCount(count);
  }
  if ((args.item.source === 'internal' || args.item.source === 'virtual') && args.item.kind === 'folder') {
    const count = countDirectChildren(args.snapshot, args.item.nodeId, 'visible');
    return formatRowCount(count);
  }
  if (args.item.source === 'externalFolder') {
    return formatRowCount(args.directory.entries.filter((entry) => entry.folderId === args.item.nodeId).length);
  }
  if (args.item.source === 'externalDirectory') {
    const prefix = args.item.directoryPath ? `${args.item.directoryPath}/` : '';
    const folderId = args.item.folderId;
    const count = args.directory.entries.filter(
      (entry) => entry.folderId === folderId && entry.relativePath.startsWith(prefix)
    ).length;
    return formatRowCount(count);
  }
  return null;
}

export function resolveDirectoryRowSubtitle(item: DirectoryListItem, t: Translate) {
  const bodyStatusLabel = resolveBodyStatusLabel(item, t);
  if (bodyStatusLabel) return bodyStatusLabel;
  if (item.preview) return item.preview;
  if (item.source === 'externalFolder' || item.source === 'externalDirectory')
    return t('companion.directory.row.externalFolder');
  if (item.source === 'externalDocument') return t('companion.directory.row.externalDocument');
  if (item.source === 'trashRoot' || item.source === 'trash')
    return t('companion.directory.row.trash');
  if (item.nodeId === 'special-inbox') return t('companion.directory.row.inbox');
  if (item.source === 'virtual') return t('companion.directory.row.virtual');
  return item.kind === 'folder'
    ? t('companion.directory.row.folder')
    : t('companion.directory.row.topic');
}
