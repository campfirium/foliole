type JsonObject = Record<string, unknown>;

export interface CanonicalExternalDocumentPayload {
  body_blob_hash: string | null;
  content_hash: string;
  document_id: string;
  extension: string;
  file_name: string;
  folder_id: string;
  reference_json: string | null;
  reference_kind: string;
  relative_path: string;
  title: string;
}

export interface CanonicalExternalFolderPayload {
  attachment_mode: string;
  excluded_dirs_json: string;
  host_name: string;
  host_platform: string;
  id: string;
  source_ref: string;
}

export function buildCanonicalExternalDocumentPayload(input: CanonicalExternalDocumentPayload) {
  return {
    body_blob_hash: input.body_blob_hash,
    content_hash: input.content_hash,
    document_id: input.document_id,
    extension: input.extension,
    file_name: input.file_name,
    folder_id: input.folder_id,
    reference_json: input.reference_json,
    reference_kind: input.reference_kind,
    relative_path: input.relative_path,
    title: input.title
  };
}

export function buildCanonicalExternalFolderPayload(input: CanonicalExternalFolderPayload) {
  return {
    attachment_mode: input.attachment_mode,
    excluded_dirs_json: input.excluded_dirs_json,
    host_name: input.host_name,
    host_platform: input.host_platform,
    id: input.id,
    source_ref: input.source_ref
  };
}

export function normalizeCanonicalExternalResourcePayload(objectType: string, value: unknown) {
  const input = asObject(value);
  if (!input) return null;
  if (objectType === 'external_document') {
    const required = readStrings(input, [
      'content_hash', 'document_id', 'extension', 'file_name', 'folder_id',
      'reference_kind', 'relative_path', 'title'
    ]);
    const bodyBlobHash = nullableString(input.body_blob_hash);
    const referenceJson = nullableString(input.reference_json);
    if (!required || bodyBlobHash === undefined || referenceJson === undefined) return null;
    return buildCanonicalExternalDocumentPayload({
      ...required as Omit<CanonicalExternalDocumentPayload, 'body_blob_hash' | 'reference_json'>,
      body_blob_hash: bodyBlobHash, reference_json: referenceJson
    });
  }
  if (objectType !== 'external_folder') return null;
  const required = readStrings(input, [
    'attachment_mode', 'excluded_dirs_json', 'host_name', 'host_platform', 'id', 'source_ref'
  ]);
  return required ? buildCanonicalExternalFolderPayload(required as unknown as CanonicalExternalFolderPayload) : null;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function readStrings(input: JsonObject, keys: string[]) {
  const entries = keys.map((key) => [key, string(input[key])] as const);
  return entries.every(([, value]) => value !== null)
    ? Object.fromEntries(entries) as Record<string, string>
    : null;
}

function string(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function nullableString(value: unknown) {
  return value === null ? null : typeof value === 'string' ? value : undefined;
}
