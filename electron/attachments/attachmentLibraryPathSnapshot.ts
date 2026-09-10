export interface AttachmentLibraryPathSnapshot {
  assetsDir: string;
  libraryScope: string;
}

let currentSnapshot: AttachmentLibraryPathSnapshot | null = null;

export function publishAttachmentLibraryPathSnapshot(snapshot: AttachmentLibraryPathSnapshot) {
  currentSnapshot = Object.freeze({ ...snapshot });
}

export function readAttachmentLibraryPathSnapshot() {
  return currentSnapshot;
}

export function clearAttachmentLibraryPathSnapshot() {
  currentSnapshot = null;
}
