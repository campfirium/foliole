export const ATTACHMENT_TOMBSTONE_CAPABILITY = 'identity-bearing-attachment-tombstone-v1';

export interface AttachmentSyncTombstone {
  attachment_id: string;
  content_hash: string;
  mime_type: string;
  storage_key: string;
}

export function parseAttachmentSyncTombstone(value: unknown): AttachmentSyncTombstone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const raw = value as Record<string, unknown>;
  const tombstone = {
    attachment_id: required(raw.attachment_id),
    content_hash: required(raw.content_hash),
    mime_type: required(raw.mime_type),
    storage_key: required(raw.storage_key)
  };
  if (!/^[a-f0-9]{64}$/u.test(tombstone.content_hash)) throw invalid();
  if (tombstone.storage_key.includes('/') || tombstone.storage_key.includes('\\') ||
      tombstone.storage_key === '.' || tombstone.storage_key === '..') throw invalid();
  return tombstone;
}

export function serializeAttachmentSyncTombstone(value: AttachmentSyncTombstone) {
  return JSON.stringify(parseAttachmentSyncTombstone(value));
}

function required(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw invalid();
  return value.trim();
}

function invalid() {
  return new Error('Invalid identity-bearing attachment tombstone.');
}
