import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { hashTextBody } from '../database/textBodyHash.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

export interface AttachmentReferenceInput {
  id: string;
  content: string | null;
  body_hash: string | null;
  resources_json: string;
}

export interface AttachmentReferenceResult {
  id: string;
  body_hash: string | null;
  resources_json: string;
  storageKeys: string[];
}

/** One node owns its current body and explicit mounts; historical bodies are outside this observation. */
export function parseAttachmentReferenceInput(input: AttachmentReferenceInput): AttachmentReferenceResult {
  if (input.content === null || (!input.body_hash && input.content !== '')) {
    throw new Error('attachment_scan_body_unreadable');
  }
  if (input.body_hash && hashTextBody(input.content) !== input.body_hash) {
    throw new Error('attachment_scan_body_hash_mismatch');
  }
  const keys = new Set(parseNodeResourceReferences(input.resources_json)
    .filter(reference => reference.role === 'reference').map(reference => reference.storage_key));
  for (const key of collectArticleImageStorageKeys(input.content)) {
    if (parseCanonicalAttachmentStorageKey(key)) keys.add(key);
  }
  return { id: input.id, body_hash: input.body_hash, resources_json: input.resources_json,
    storageKeys: [...keys] };
}
