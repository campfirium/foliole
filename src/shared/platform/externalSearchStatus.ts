import type { RuntimeExternalSearchFolder } from './externalSearchBridge';

export function resolveExternalSearchStatusLabel(folder: Pick<RuntimeExternalSearchFolder, 'lastError' | 'status'>) {
  if (folder.status === 'error' || Boolean(folder.lastError)) {
    return 'Folder unavailable';
  }
  if (folder.status === 'indexing') {
    return 'Updating';
  }
  if (folder.status === 'ready') {
    return 'Ready';
  }
  return 'Waiting to update';
}

export function resolveExternalSectionStatusLabel(
  folders: Array<Pick<RuntimeExternalSearchFolder, 'lastError' | 'status'>>
) {
  if (folders.some((folder) => folder.status === 'error' || Boolean(folder.lastError))) {
    return 'Folder unavailable';
  }
  if (folders.some((folder) => folder.status === 'indexing')) {
    return 'Updating';
  }
  if (folders.some((folder) => folder.status === 'idle')) {
    return 'Waiting to update';
  }
  if (folders.some((folder) => folder.status === 'ready')) {
    return 'Ready';
  }
  return null;
}
