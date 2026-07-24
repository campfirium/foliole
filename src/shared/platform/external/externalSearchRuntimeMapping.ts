import type {
  NativeExternalSearchAttachmentMode,
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview
} from '../../../../lib/platform/nativeStorageContract';

export interface RuntimeExternalSearchFolder {
  accessMode?: 'local' | 'remote_mirror' | 'unowned';
  attachmentMode: NativeExternalSearchAttachmentMode;
  attachmentRootPath: string | null;
  createdAt: string;
  claimUnowned?: boolean;
  documentCount: number;
  excludedDirs: string[];
  folderPath: string;
  id: string;
  indexedAt: string | null;
  lastError: string | null;
  mirrorEnabled?: boolean;
  ownerDeviceName?: string | null;
  ownerInstallationId?: string | null;
  ownerPlatform?: string | null;
  status: 'error' | 'idle' | 'indexing' | 'ready';
  updatedAt: string;
}

export interface RuntimeExternalSearchPreview {
  absolutePath: string;
  content: string;
  editable?: boolean | undefined;
  extension: 'md' | 'txt';
  fileName: string;
  fileSize?: number | null;
  folderId: string;
  folderPath: string;
  importedNodeId?: string | null;
  isPresent?: boolean | undefined;
  lastOpenedAt?: string | null;
  modifiedAt?: string | null;
  documentId?: string;
  reference?: RuntimeExternalDocumentReference;
  relativePath: string;
  sourceKind?: 'external_document' | 'local_file' | undefined;
}

export interface RuntimeExternalSearchBrowseEntry extends Omit<RuntimeExternalSearchPreview, 'content' | 'modifiedAt'> {
  modifiedAt: string;
  openingText: string | null;
  title: string;
}

export type RuntimeExternalDocumentReference =
  | { absolutePath: string; kind: 'local_path' }
  | { documentId: string; kind: 'mirror_document' };

function referenceOf(value: NativeExternalSearchPreview | NativeExternalSearchBrowseEntry) {
  return value.reference ?? ('absolute_path' in value
    ? { absolute_path: value.absolute_path, kind: 'local_path' as const }
    : { document_id: value.document_id, kind: 'mirror_document' as const });
}

function commonDocumentFields(value: NativeExternalSearchPreview | NativeExternalSearchBrowseEntry) {
  const reference = referenceOf(value);
  return {
    absolutePath: 'absolute_path' in value ? value.absolute_path : `mirror-document:${value.document_id}`,
    editable: value.editable,
    extension: value.extension,
    fileName: value.file_name,
    fileSize: value.file_size ?? null,
    folderId: value.folder_id,
    folderPath: value.folder_path,
    importedNodeId: value.imported_node_id ?? null,
    isPresent: value.is_present,
    lastOpenedAt: value.last_opened_at ?? null,
    ...('document_id' in value ? { documentId: value.document_id } : {}),
    reference: reference.kind === 'local_path'
      ? { absolutePath: reference.absolute_path, kind: 'local_path' as const }
      : { documentId: reference.document_id, kind: 'mirror_document' as const },
    relativePath: value.relative_path,
    sourceKind: value.source_kind
  };
}

export function toRuntimeExternalSearchFolder(value: NativeExternalSearchFolder): RuntimeExternalSearchFolder {
  return {
    accessMode: value.access_mode ?? 'local', attachmentMode: value.attachment_mode,
    attachmentRootPath: value.attachment_root_path, createdAt: value.created_at,
    documentCount: value.document_count, excludedDirs: value.excluded_dirs, folderPath: value.folder_path,
    id: value.id, indexedAt: value.indexed_at, lastError: value.last_error,
    mirrorEnabled: value.mirror_enabled !== false, ownerDeviceName: value.owner_device_name ?? null,
    ownerInstallationId: value.owner_installation_id ?? null, ownerPlatform: value.owner_platform ?? null,
    status: value.status, updatedAt: value.updated_at
  };
}

export function toRuntimeExternalSearchPreview(value: NativeExternalSearchPreview): RuntimeExternalSearchPreview {
  return { ...commonDocumentFields(value), content: value.content, modifiedAt: value.modified_at ?? null };
}

export function toRuntimeExternalSearchBrowseEntry(value: NativeExternalSearchBrowseEntry): RuntimeExternalSearchBrowseEntry {
  return { ...commonDocumentFields(value), modifiedAt: value.modified_at, openingText: value.opening_text, title: value.title };
}
