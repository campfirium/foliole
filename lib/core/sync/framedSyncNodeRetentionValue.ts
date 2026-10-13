import type { CanonicalValue } from './framedSyncCanonicalManifest.js';

export function projectNodeRetention(value: number | null | undefined): CanonicalValue {
  if (value === null || value === undefined) return { kind: 'null' };
  if (!Number.isFinite(value)) throw new Error('node_version_fact_retention_invalid');
  return Number.isSafeInteger(value)
    ? { kind: 'signed', value: BigInt(value) }
    : { kind: 'string', value: String(value) };
}

export function readNodeRetention(value: CanonicalValue): number | null {
  if (value.kind === 'null') return null;
  if (value.kind === 'signed' && value.value >= BigInt(Number.MIN_SAFE_INTEGER) &&
      value.value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value.value);
  if (value.kind === 'string') {
    const number = Number(value.value);
    if (Number.isFinite(number) && !Number.isSafeInteger(number) &&
        String(number) === value.value) return number;
  }
  throw new Error('node_version_fact_retention_invalid');
}
