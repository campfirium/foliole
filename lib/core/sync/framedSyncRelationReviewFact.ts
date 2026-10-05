import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';

import {
  canonicalManifestBytes,
  type CanonicalFact,
  type CanonicalField,
  type CanonicalValue
} from './framedSyncCanonicalManifest.js';
import {
  identityParentRowSchema,
  identityReviewRowSchema
} from './syncIdentityFactRowSchemas.js';

const parentSourceSchema = identityParentRowSchema.extend({
  object_id: z.string().min(1),
  ordinal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
}).strict();

const reviewSourceSchema = identityReviewRowSchema.extend({
  difficulty_after: z.number().finite(),
  difficulty_before: z.number().finite(),
  due_before: z.string(),
  grade: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  host_name: z.string().min(1),
  id: z.string().min(1),
  stability_after: z.number().finite(),
  stability_before: z.number().finite()
}).strict();

export type FramedSyncParentRelationSource = z.infer<typeof parentSourceSchema>;
export type FramedSyncReviewSource = z.infer<typeof reviewSourceSchema>;

const EMPTY_HASH = new Uint8Array(32);
const FACT = Object.freeze({ parentKind: 3, reviewKind: 4, objectType: 'node' });
const field = (name: string, value: CanonicalValue): CanonicalField => ({ name, value });
const text = (value: string): CanonicalValue => ({ kind: 'string', value });
const signed = (value: number): CanonicalValue => ({ kind: 'signed', value: BigInt(value) });

function numberText(value: number) {
  if (!Number.isFinite(value)) throw new Error('framed_sync_review_number_invalid');
  return String(value);
}

function factHash(fact: CanonicalFact) {
  const canonical = canonicalManifestBytes({
    blobs: [], facts: [{ ...fact, sharedStateHash: EMPTY_HASH }]
  });
  return sha256(canonical);
}

function withSharedStateHash(fact: CanonicalFact): CanonicalFact {
  return { ...fact, sharedStateHash: factHash(fact) };
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function fieldsByName(fact: CanonicalFact, expected: readonly string[], error: string) {
  const fields = new Map(fact.body.map((entry) => [entry.name, entry.value]));
  if (fields.size !== fact.body.length || fields.size !== expected.length ||
      expected.some((name) => !fields.has(name))) throw new Error(error);
  return fields;
}

function required(fields: ReadonlyMap<string, CanonicalValue>, name: string) {
  const value = fields.get(name);
  if (!value) throw new Error(`framed_sync_relation_review_field_missing:${name}`);
  return value;
}

function readText(value: CanonicalValue) {
  if (value.kind !== 'string') throw new Error('framed_sync_relation_review_string_invalid');
  return value.value;
}

function readInteger(value: CanonicalValue) {
  if (value.kind !== 'signed' || value.value < BigInt(Number.MIN_SAFE_INTEGER) ||
      value.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('framed_sync_relation_review_integer_invalid');
  }
  return Number(value.value);
}

function readNumberText(value: CanonicalValue) {
  const source = readText(value);
  const parsed = Number(source);
  if (!Number.isFinite(parsed) || String(parsed) !== source) {
    throw new Error('framed_sync_review_number_invalid');
  }
  return parsed;
}

function assertFact(fact: CanonicalFact, kind: number, factId: string) {
  if (fact.kind !== kind || fact.objectType !== FACT.objectType || !fact.globalId ||
      fact.factId !== factId || fact.blobs.length !== 0 || !sameBytes(fact.sharedStateHash, factHash(fact))) {
    throw new Error('framed_sync_relation_review_fact_invalid');
  }
}

export function framedSyncParentRelationFactId(source: {
  ordinal: number;
  parent_version_id: string;
  version_id: string;
}) {
  return JSON.stringify([source.version_id, source.parent_version_id, source.ordinal]);
}

export function projectFramedSyncParentRelation(source: unknown): CanonicalFact {
  const row = parentSourceSchema.parse(source);
  const fact = withSharedStateHash({
    blobs: [],
    body: [
      field('ordinal', { kind: 'unsigned', value: BigInt(row.ordinal) }),
      field('parent_version_id', text(row.parent_version_id)),
      field('version_id', text(row.version_id))
    ],
    factId: framedSyncParentRelationFactId(row),
    globalId: row.object_id,
    kind: FACT.parentKind,
    objectType: FACT.objectType,
    sharedStateHash: EMPTY_HASH
  });
  restoreFramedSyncParentRelation(fact);
  return fact;
}

export function restoreFramedSyncParentRelation(fact: CanonicalFact) {
  const fields = fieldsByName(
    fact, ['ordinal', 'parent_version_id', 'version_id'], 'framed_sync_parent_relation_shape_invalid'
  );
  const ordinal = required(fields, 'ordinal');
  if (ordinal.kind !== 'unsigned' || ordinal.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('framed_sync_parent_relation_ordinal_invalid');
  }
  const row = parentSourceSchema.parse({
    object_id: fact.globalId,
    ordinal: Number(ordinal.value),
    parent_version_id: readText(required(fields, 'parent_version_id')),
    version_id: readText(required(fields, 'version_id'))
  });
  assertFact(fact, FACT.parentKind, framedSyncParentRelationFactId(row));
  return row;
}

export function projectFramedSyncReview(source: unknown): CanonicalFact {
  const row = reviewSourceSchema.parse(source);
  const fact = withSharedStateHash({
    blobs: [],
    body: [
      field('difficulty_after', text(numberText(row.difficulty_after))),
      field('difficulty_before', text(numberText(row.difficulty_before))),
      field('due_after', text(row.due_after)), field('due_before', text(row.due_before)),
      field('grade', signed(row.grade)), field('host_name', text(row.host_name)),
      field('id', text(row.id)), field('node_id', text(row.node_id)),
      field('op_id', text(row.op_id)), field('reviewed_at', text(row.reviewed_at)),
      field('scheduler_version', text(row.scheduler_version)),
      field('stability_after', text(numberText(row.stability_after))),
      field('stability_before', text(numberText(row.stability_before)))
    ],
    factId: row.op_id, globalId: row.node_id, kind: FACT.reviewKind,
    objectType: FACT.objectType, sharedStateHash: EMPTY_HASH
  });
  restoreFramedSyncReview(fact);
  return fact;
}

const REVIEW_FIELDS = [
  'difficulty_after', 'difficulty_before', 'due_after', 'due_before', 'grade', 'host_name',
  'id', 'node_id', 'op_id', 'reviewed_at', 'scheduler_version', 'stability_after',
  'stability_before'
] as const;

export function restoreFramedSyncReview(fact: CanonicalFact) {
  const fields = fieldsByName(fact, REVIEW_FIELDS, 'framed_sync_review_shape_invalid');
  const get = (name: typeof REVIEW_FIELDS[number]) => required(fields, name);
  const row = reviewSourceSchema.parse({
    difficulty_after: readNumberText(get('difficulty_after')),
    difficulty_before: readNumberText(get('difficulty_before')),
    due_after: readText(get('due_after')), due_before: readText(get('due_before')),
    grade: readInteger(get('grade')), host_name: readText(get('host_name')),
    id: readText(get('id')), node_id: readText(get('node_id')),
    op_id: readText(get('op_id')), reviewed_at: readText(get('reviewed_at')),
    scheduler_version: readText(get('scheduler_version')),
    stability_after: readNumberText(get('stability_after')),
    stability_before: readNumberText(get('stability_before'))
  });
  assertFact(fact, FACT.reviewKind, row.op_id);
  if (row.node_id !== fact.globalId) throw new Error('framed_sync_review_identity_invalid');
  return row;
}
