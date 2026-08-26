export const SYNC_GROUP_DEVICE_CONTENT_BOUNDARY_VERSION = 1;

export const DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS = [
  'canonical_library_path',
  'device_anchor',
  'device_identity_key',
  'device_key',
  'identity_key'
] as const;

const forbiddenKeys = new Set<string>(DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS);

export function assertBusinessPayloadExcludesDeviceIdentity(value: unknown): void {
  visit(value, new Set<object>());
}

function visit(value: unknown, seen: Set<object>): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new Error('business_payload_cycle');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, seen);
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) throw new Error(`device_identity_in_business_payload:${key}`);
      visit(child, seen);
    }
  }
  seen.delete(value);
}
