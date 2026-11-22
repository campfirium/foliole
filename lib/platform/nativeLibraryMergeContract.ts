/** A library chosen for merging, with the attachments folder found next to it. */
export interface NativeLibraryMergeSource {
  sourcePath: string;
  attachmentsDirectory: string | null;
}

export interface NativeLibraryMergeArgs extends NativeLibraryMergeSource {
  folderTitle: string;
}

export interface NativeLibraryMergeResult {
  added: number;
  alternatives: number;
  unchanged: number;
  skippedDeleted: number;
  reviewsAdded: number;
  attachmentsCopied: number;
  attachmentsMissing: number;
  folderId: string | null;
}
