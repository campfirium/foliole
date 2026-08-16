import { createHash } from 'node:crypto';

export const READINESS_SCHEMA_VERSION = 1;
export const READINESS_BINDING_NAMES = [
  'candidate',
  'controller',
  'adapter',
  'baseline',
  'criteria',
  'evidence',
  'cleanup'
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function readinessDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function createReadinessBindings(definition) {
  return Object.fromEntries(READINESS_BINDING_NAMES.map((name) => {
    const value = definition?.[name];
    if (!value || typeof value !== 'object') throw new Error(`Missing readiness binding: ${name}`);
    return [name, { digest: readinessDigest(value), value: canonicalize(value) }];
  }));
}

export function readinessFingerprint(bindings) {
  const digests = Object.fromEntries(READINESS_BINDING_NAMES.map((name) => {
    const digest = bindings?.[name]?.digest;
    if (!/^[a-f0-9]{64}$/u.test(digest ?? '')) throw new Error(`Invalid readiness binding digest: ${name}`);
    return [name, digest];
  }));
  return readinessDigest(digests);
}

export function createReadinessReceipt({ bindings, completedAt, facts, locator, startedAt }) {
  const status = facts.every((fact) => fact.status === 'passed')
    ? 'ready'
    : facts.some((fact) => fact.status === 'invalidated') ? 'invalidated' : 'blocked';
  return {
    bindings,
    completedAt,
    facts,
    fingerprint: readinessFingerprint(bindings),
    locator,
    schemaVersion: READINESS_SCHEMA_VERSION,
    startedAt,
    status,
    summary: {
      failedOwners: facts.filter((fact) => fact.status !== 'passed').map((fact) => fact.owner),
      lastSuccessfulAction: facts.filter((fact) => fact.status === 'passed').at(-1)?.action ?? null
    }
  };
}

export function enforceJourneyReadiness(receipt, currentDefinition) {
  if (receipt?.schemaVersion !== READINESS_SCHEMA_VERSION) {
    throw new Error('Journey readiness receipt schema is unsupported.');
  }
  if (receipt.status !== 'ready') throw new Error(`Journey readiness is ${receipt.status ?? 'missing'}.`);
  const currentBindings = createReadinessBindings(currentDefinition);
  for (const name of READINESS_BINDING_NAMES) {
    if (receipt.bindings?.[name]?.digest !== currentBindings[name].digest) {
      throw new Error(`Journey readiness binding changed: ${name}.`);
    }
  }
  if (receipt.fingerprint !== readinessFingerprint(currentBindings)) {
    throw new Error('Journey readiness fingerprint changed.');
  }
  return receipt;
}
