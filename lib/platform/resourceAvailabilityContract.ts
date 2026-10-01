import { parseCanonicalAttachmentStorageKey } from './attachmentResource.js';

export const RESOURCE_AVAILABILITY_PATH = '/companion/resource-availability';
export const RESOURCE_AVAILABILITY_BATCH_LIMIT = 32;
export const CONTENT_BLOB_BATCH_MAX_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_RANGE_BYTES = 1024 * 1024;
export const RESOURCE_AVAILABILITY_REPLY_LIMIT = 64 * 1024;
export const RESOURCE_CLAIM_TTL_MS = 30_000;
export type ResourceKind = 'attachment' | 'content_blob';
export type ResourceNeed = { kind: ResourceKind; id: string; storage_key?: string };
export type ResourceClaim = ResourceNeed & {
  status: 'available' | 'missing' | 'checksum_mismatch';
  sha256?: string;
  size_bytes?: number;
};
export type ResourceFailure = 'missing_file' | 'checksum_mismatch' | 'authentication_failed' |
  'network_error' | 'protocol_error' | 'device_identity_mismatch' | 'unreachable' | 'disk_full';
export type ResourceAvailabilityReply = { provider_device_id: string; resources: ResourceClaim[] };
export function takeContentBlobByteBatch<T>(rows: readonly T[], sizeOf: (row: T) => number): T[] {
  const selected: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = sizeOf(row);
    if (!Number.isSafeInteger(size) || size < 0 || size > CONTENT_BLOB_BATCH_MAX_BYTES) {
      throw new Error('content_blob_batch_row_exceeds_budget');
    }
    if (selected.length > 0 && bytes + size > CONTENT_BLOB_BATCH_MAX_BYTES) break;
    selected.push(row);
    bytes += size;
  }
  return selected;
}
export function resourceKey(resource: ResourceNeed) { return `${resource.kind}:${resource.id}`; }
export function parseResourceNeeds(value: unknown): ResourceNeed[] {
  const resources = (value as { resources?: unknown } | null)?.resources;
  if (!Array.isArray(resources) || resources.length > RESOURCE_AVAILABILITY_BATCH_LIMIT) {
    throw new Error('resource_availability_invalid_request');
  }
  const seen = new Set<string>();
  return resources.map((resource: ResourceNeed) => {
    if (!resource || !['attachment', 'content_blob'].includes(resource.kind) ||
        typeof resource.id !== 'string' || !/^[a-f0-9]{64}$/.test(resource.id) || seen.has(resourceKey(resource))) {
      throw new Error('resource_availability_invalid_request');
    }
    const identity = resource.kind === 'attachment' && typeof resource.storage_key === 'string'
      ? parseCanonicalAttachmentStorageKey(resource.storage_key) : null;
    if (resource.kind === 'attachment' && identity?.contentHash !== resource.id) {
      throw new Error('resource_availability_invalid_request');
    }
    seen.add(resourceKey(resource));
    return { kind: resource.kind, id: resource.id,
      ...(identity ? { storage_key: identity.storageKey } : {}) };
  });
}
export function parseResourceClaims(value: unknown, deviceId: string, needs: readonly ResourceNeed[]) {
  const reply = value as ResourceAvailabilityReply | null;
  if (reply?.provider_device_id !== deviceId) throw new Error('resource_provider_identity_mismatch');
  if (new TextEncoder().encode(JSON.stringify(reply)).byteLength > RESOURCE_AVAILABILITY_REPLY_LIMIT) {
    throw new Error('resource_availability_protocol_error');
  }
  if (!Array.isArray(reply.resources) || reply.resources.length !== needs.length) {
    throw new Error('resource_availability_protocol_error');
  }
  const expected = new Map(needs.map((need) => [resourceKey(need), need]));
  return reply.resources.map((claim) => {
    const need = claim ? expected.get(resourceKey(claim)) : undefined;
    if (!claim || !need || (need.storage_key !== undefined && claim.storage_key !== need.storage_key) ||
        !['available', 'missing', 'checksum_mismatch'].includes(claim.status)) {
      throw new Error('resource_availability_protocol_error');
    }
    expected.delete(resourceKey(claim));
    if (claim.status === 'available' && (typeof claim.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(claim.sha256) ||
        !Number.isSafeInteger(claim.size_bytes) || claim.size_bytes! < 0 ||
        (claim.kind === 'attachment' && claim.sha256 !== claim.id))) {
      throw new Error('resource_availability_protocol_error');
    }
    return { kind: claim.kind, id: claim.id, status: claim.status,
      ...(need.storage_key ? { storage_key: need.storage_key } : {}),
      ...(claim.status === 'available' ? { sha256: claim.sha256!, size_bytes: claim.size_bytes! } : {}) };
  });
}
export function classifyResourceFailure(error: unknown): ResourceFailure {
  const message = error instanceof Error ? error.message : String(error);
  if ((error as NodeJS.ErrnoException | null)?.code === 'ENOSPC' ||
      /no space left|disk(?: is)? full|storage full|out of space|disk_full/i.test(message)) return 'disk_full';
  if (/identity_mismatch/.test(message)) return 'device_identity_mismatch';
  if (/checksum|hash mismatch/i.test(message)) return 'checksum_mismatch';
  if (/401|403|authentication|signature|workgroup_aead|device_not_active|workgroup_key|member_state_required|group_not_available/.test(message)) return 'authentication_failed';
  if (/404|missing_file|blob_not_found/.test(message)) return 'missing_file';
  if (error instanceof SyntaxError || /http_|returned \d|protocol|invalid|truncated/.test(message)) return 'protocol_error';
  if (/network|fetch failed|failed to fetch|timeout|timed out|abort|socket|connect|offline|ECONN|ENOTFOUND/i.test(message)) return 'network_error';
  return 'protocol_error';
}
