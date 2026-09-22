import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { Translate } from '../shared/localization/LocalizationProvider';
import { countCompanionExternalDirectoryEntries, resolveCompanionDirectoryCounts } from '../shared/platform/companion/browse/companionDirectoryCounts';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';

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
    const count = args.snapshot ? resolveCompanionDirectoryCounts(args.snapshot).trashCount : null;
    return formatRowCount(count);
  }
  if (args.item.source === 'trash' && args.item.kind === 'folder') {
    const count = args.snapshot ? resolveCompanionDirectoryCounts(args.snapshot).countChildren(args.item.nodeId, 'trash') : null;
    return formatRowCount(count);
  }
  if (args.item.source === 'virtual' && args.item.kind === 'folder') {
    const virtualCount = args.snapshot ? resolveCompanionDirectoryCounts(args.snapshot).countVirtualResults(args.item.nodeId) : null;
    const count = virtualCount ?? (args.snapshot ? resolveCompanionDirectoryCounts(args.snapshot).countChildren(args.item.nodeId, 'visible') : null);
    return formatRowCount(count);
  }
  if (args.item.source === 'internal' && args.item.kind === 'folder') {
    const count = args.snapshot ? resolveCompanionDirectoryCounts(args.snapshot).countChildren(args.item.nodeId, 'visible') : null;
    return formatRowCount(count);
  }
  if (args.item.source === 'externalFolder') {
    return formatRowCount(countCompanionExternalDirectoryEntries(args.directory.entries, args.item.nodeId));
  }
  if (args.item.source === 'externalDirectory') {
    const count = countCompanionExternalDirectoryEntries(args.directory.entries, args.item.folderId, args.item.directoryPath);
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
