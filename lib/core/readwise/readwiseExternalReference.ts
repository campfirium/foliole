import { createHash } from 'node:crypto';

export interface ReadwiseExternalReferencePayload {
  connection_ref: string;
  kind: 'readwise_remote';
  provider: 'readwise';
  reader_url: string | null;
  remote_document_id: string;
  source_url: string | null;
  version: 1;
}

export function buildReadwiseExternalDocumentId(connectionRef: string, remoteDocumentId: string) {
  return `readwise-remote:${sha256(`${connectionRef}\u001f${remoteDocumentId}`).slice(0, 32)}`;
}

export function buildReadwiseExternalDisplayLocation(title: string, remoteDocumentId: string) {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 120) || 'Untitled';
  return `${safeTitle} · ${sha256(remoteDocumentId).slice(0, 8)}.md`;
}

export function serializeReadwiseExternalReference(input: Omit<ReadwiseExternalReferencePayload, 'kind' | 'provider' | 'version'>) {
  return JSON.stringify({ ...input, kind: 'readwise_remote', provider: 'readwise', version: 1 });
}

export function parseReadwiseExternalReference(value: string | null | undefined): ReadwiseExternalReferencePayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ReadwiseExternalReferencePayload>;
    if (parsed.version !== 1 || parsed.kind !== 'readwise_remote' || parsed.provider !== 'readwise') return null;
    if (!nonEmpty(parsed.connection_ref) || !nonEmpty(parsed.remote_document_id)) return null;
    return {
      connection_ref: parsed.connection_ref,
      kind: 'readwise_remote',
      provider: 'readwise',
      reader_url: safeUrl(parsed.reader_url),
      remote_document_id: parsed.remote_document_id,
      source_url: safeUrl(parsed.source_url),
      version: 1
    };
  } catch {
    return null;
  }
}

function safeUrl(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
