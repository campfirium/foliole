import type { CanonicalBlob, CanonicalFact, CanonicalField, CanonicalManifest, CanonicalValue } from './framedSyncCanonicalManifest.js';

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function sameValue(left: CanonicalValue, right: CanonicalValue): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'null': return true;
    case 'bytes': return right.kind === 'bytes' && sameBytes(left.value, right.value);
    case 'object': return right.kind === 'object' && sameFields(left.value, right.value);
    case 'list': return right.kind === 'list' && left.value.length === right.value.length &&
      left.value.every((entry, index) => sameValue(entry, right.value[index]!));
    default: return 'value' in right && left.value === right.value;
  }
}

function sameFields(left: readonly CanonicalField[], right: readonly CanonicalField[]) {
  if (left.length !== right.length) return false;
  const fields = new Map(right.map((entry) => [entry.name, entry.value]));
  return left.every((entry) => {
    const value = fields.get(entry.name);
    return value !== undefined && sameValue(entry.value, value);
  });
}

function sameBlobs(left: readonly CanonicalBlob[], right: readonly CanonicalBlob[]) {
  if (left.length !== right.length) return false;
  const blobs = new Map(right.map((entry) => [key(entry.sha256), entry]));
  return left.every((entry) => {
    const value = blobs.get(key(entry.sha256));
    return value !== undefined && entry.byteLength === value.byteLength && entry.role === value.role &&
      entry.required === value.required;
  });
}

function key(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function factKey(fact: CanonicalFact) {
  return JSON.stringify([fact.kind, fact.objectType, fact.globalId, fact.factId]);
}

/** Both manifests must first pass canonical validation; compare exact encodings without assembling them. */
export function sameCanonicalManifest(left: CanonicalManifest, right: CanonicalManifest) {
  if (left.facts.length !== right.facts.length || !sameBlobs(left.blobs, right.blobs)) return false;
  const facts = new Map(right.facts.map((fact) => [factKey(fact), fact]));
  return left.facts.every((fact) => {
    const value = facts.get(factKey(fact));
    return value !== undefined && sameBytes(fact.sharedStateHash, value.sharedStateHash) &&
      sameFields(fact.body, value.body) && sameBlobs(fact.blobs, value.blobs);
  });
}
