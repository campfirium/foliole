import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

/** Node-owned business information; file possession and byte counts are never stored here. */
export interface NodeResourceReference {
  storage_key: string;
  role: 'image' | 'reference';
  original_name: string | null;
}

export function parseNodeResourceReferences(value: string | null | undefined): NodeResourceReference[] {
  const decoded: unknown = value ? JSON.parse(value) : [];
  if (!Array.isArray(decoded)) throw new Error('node_resource_references_invalid');
  const unique = new Map<string, NodeResourceReference>();
  for (const item of decoded) {
    if (!item || typeof item !== 'object') throw new Error('node_resource_reference_invalid');
    const row = item as NodeResourceReference;
    if (typeof row.storage_key !== 'string' || !parseCanonicalAttachmentStorageKey(row.storage_key) ||
        !['image', 'reference'].includes(row.role) ||
        (row.original_name !== null && typeof row.original_name !== 'string')) {
      throw new Error('node_resource_reference_invalid');
    }
    const key = `${row.storage_key}:${row.role}`;
    if (unique.has(key)) throw new Error('node_resource_reference_duplicate');
    unique.set(key, { storage_key: row.storage_key, role: row.role, original_name: row.original_name });
  }
  return [...unique.values()].sort((a, b) => a.storage_key.localeCompare(b.storage_key) || a.role.localeCompare(b.role));
}

export function serializeNodeResourceReferences(references: readonly NodeResourceReference[]) {
  return JSON.stringify(parseNodeResourceReferences(JSON.stringify(references)));
}

export function upsertNodeResourceReference(value: string | null, reference: NodeResourceReference) {
  const references = parseNodeResourceReferences(value).filter((row) =>
    row.storage_key !== reference.storage_key || row.role !== reference.role);
  return serializeNodeResourceReferences([...references, reference]);
}

/** Legacy response shape projected from the owning node, never a second stored relation. */
export function projectNodeResourceLinks(value: string | null | undefined) {
  return parseNodeResourceReferences(value).map((reference) => ({
    attachment_id: parseCanonicalAttachmentStorageKey(reference.storage_key)!.contentHash,
    role: reference.role
  }));
}
