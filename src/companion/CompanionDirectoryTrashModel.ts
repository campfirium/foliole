import type { CompanionFolderListEntry } from '../shared/platform/companionBrowseLists';

export type TrashDirectoryListItem =
  | (CompanionFolderListEntry & { id: string; source: 'trash' })
  | { id: string; kind: 'folder'; nodeId: string; preview: null; source: 'trashRoot'; title: string };

export function toTrashItem(item: CompanionFolderListEntry): TrashDirectoryListItem {
  return { ...item, id: `trash:${item.nodeId}`, source: 'trash' };
}

export function toTrashRootItem(): TrashDirectoryListItem {
  return { id: 'trash-root', kind: 'folder', nodeId: 'trash-root', preview: null, source: 'trashRoot', title: 'Trash' };
}
