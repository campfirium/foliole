import { createHash } from 'node:crypto';

export const READINESS_SCHEMA_VERSION = 2;
export const READINESS_PROVENANCE_NAMES = [
  'source',
  'action',
  'target',
  'mutation',
  'integrity',
  'cleanup',
  'locator'
];
export const READINESS_STAGE_NAMES = [
  'source', 'action', 'target', 'mutation', 'integrity', 'cleanup', 'locator'
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

export function createReadinessProvenance(definition) {
  return Object.fromEntries(READINESS_PROVENANCE_NAMES.map((name) => {
    const value = definition?.[name];
    if (!value || typeof value !== 'object') throw new Error(`Missing readiness provenance: ${name}`);
    return [name, { digest: readinessDigest(value), value: canonicalize(value) }];
  }));
}

export function readinessFingerprint(provenance) {
  const digests = Object.fromEntries(READINESS_PROVENANCE_NAMES.map((name) => {
    const digest = provenance?.[name]?.digest;
    if (!/^[a-f0-9]{64}$/u.test(digest ?? '')) {
      throw new Error(`Invalid readiness provenance digest: ${name}`);
    }
    return [name, digest];
  }));
  return readinessDigest(digests);
}

export function createReadinessReceipt({ completedAt, facts, locator, provenance, startedAt }) {
  const status = facts.every((fact) => fact.status === 'passed')
    ? 'ready'
    : facts.some((fact) => fact.status === 'invalidated') ? 'invalidated' : 'blocked';
  return {
    completedAt,
    facts,
    fingerprint: readinessFingerprint(provenance),
    locator,
    provenance,
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
  if (typeof receipt.locator !== 'string' || receipt.locator === '') {
    throw new Error('Journey readiness locator is missing.');
  }
  const owners = receipt.facts?.map((fact) => fact.owner);
  if (JSON.stringify(owners) !== JSON.stringify(READINESS_STAGE_NAMES)
      || receipt.facts.some((fact) => fact.status !== 'passed')) {
    throw new Error('Journey readiness trust facts are unsupported.');
  }
  const currentProvenance = createReadinessProvenance(currentDefinition);
  for (const name of READINESS_PROVENANCE_NAMES) {
    if (receipt.provenance?.[name]?.digest !== currentProvenance[name].digest) {
      throw new Error(`Journey readiness provenance changed: ${name}.`);
    }
  }
  if (receipt.fingerprint !== readinessFingerprint(currentProvenance)) {
    throw new Error('Journey readiness fingerprint changed.');
  }
  return receipt;
}
