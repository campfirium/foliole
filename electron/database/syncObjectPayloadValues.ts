import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

export type JsonObject = Record<string, unknown>;

export function asObject(record: NativeSyncObjectRecord): JsonObject {
  if (!record.payload_json) return {};
  const parsed = JSON.parse(record.payload_json) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : {};
}

export function text(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function numberOrNull(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function integer(value: unknown) {
  return Math.trunc(numberOrNull(value) ?? 0);
}
