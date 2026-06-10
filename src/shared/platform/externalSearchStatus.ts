interface ExternalSearchStatusLike {
  lastError: string | null;
  status: 'error' | 'idle' | 'indexing' | 'ready';
}

export function resolveExternalSectionStatusLabel(folders: ExternalSearchStatusLike[]) {
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
