import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applyNodeReadingObject, applyNodeReviewObject } from '../../../../../lib/core/sync/syncObjectLearningPayloadExecutor';
import { applyNodeOpenStateObject } from '../../../../../lib/core/sync/syncObjectOpenStatePayloadExecutor';
import { createCompanionUuid } from '../../companionUuid';

import { writeIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import {
  iosCompanionContentHash,
  iosCompanionHostName,
  markIosCompanionMutation
} from './iosCompanionMutationState';

export function saveIosSetting(args: {
  form_factor?: string; key: string; platform?: string; scope?: string; value_json: string;
}) {
  return writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const hostName = args.scope === 'user_space' ? '*' : await iosCompanionHostName(tx);
    const formFactor = args.form_factor ?? 'phone';
    const platform = args.platform ?? getIosCompanionDatabaseOwner().platform ?? 'ios';
    const scope = args.scope ?? 'host';
    const objectId = [scope, platform, formFactor, hostName, args.key].join(':');
    const payload = { host_name: hostName, form_factor: formFactor, key: args.key, platform, scope, value_json: args.value_json };
    const contentHash = await iosCompanionContentHash(payload);
    const now = new Date().toISOString();
    await tx.run(
      'INSERT OR REPLACE INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [args.key, scope, platform, formFactor, hostName, args.value_json, contentHash, now]
    );
    await mark(tx, 'setting', objectId, contentHash, now);
    return { content_hash: contentHash, object_id: objectId };
  }));
}

export function saveIosOpenState(args: { last_opened_at: string; node_id: string }) {
  return writeObject('node_open_state', args.node_id, { last_opened_at: args.last_opened_at, node_id: args.node_id }, applyNodeOpenStateObject)
    .then((result) => ({ ...result, last_opened_at: args.last_opened_at }));
}

export function saveIosReading(args: { node_id: string; reading_json: string }) {
  return writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const input = parseObject(args.reading_json);
    const hostName = await iosCompanionHostName(tx);
    const payload: Record<string, unknown> = { ...input, host_name: hostName, node_id: args.node_id };
    const { host_name: ignoredHost, reading_position: ignoredPosition, ...hashPayload } = payload;
    void ignoredHost; void ignoredPosition;
    return applyLocalObject(tx, 'node_reading', args.node_id, payload, (record) => (
      applyNodeReadingObject(tx, record, { hostName })
    ), hashPayload);
  }));
}

export function saveIosReview(args: { node_id: string; review_json: string; review_log_json?: string }) {
  return writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const payload = { ...parseObject(args.review_json), node_id: args.node_id };
    const result = await applyLocalObject(tx, 'node_review', args.node_id, payload, (record) => applyNodeReviewObject(tx, record));
    if (!args.review_log_json) return result;
    const opId = createCompanionUuid();
    await insertReviewLog(tx, args.node_id, opId, parseObject(args.review_log_json));
    return { ...result, op_id: opId };
  }));
}

export function saveIosActiveViewState(args: { node_id: string | null }) {
  return writeViewState('active_node', { active_node_id: args.node_id }, async (db, _hostName, now) => {
    if (args.node_id) await db.run("INSERT OR REPLACE INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, ?)", [args.node_id, now]);
    else await db.run("DELETE FROM workspace_meta WHERE key = 'active_node_id'");
  });
}

export function saveIosNodeViewState(args: { node_id: string; scroll_top: number; source?: string }) {
  const payload = { node_id: args.node_id, scroll_top: Math.max(0, Math.trunc(args.scroll_top)), selection_from: null, selection_to: null, source: 'user-scroll' };
  return writeViewState(`node:${args.node_id}`, payload, (db, hostName, now) => db.run(
    'INSERT OR REPLACE INTO node_view_state (node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)',
    [args.node_id, hostName, payload.scroll_top, payload.source, now]
  ));
}

async function writeObject(
  objectType: string, objectId: string, payload: Record<string, unknown>,
  apply: (db: DbPort, record: LocalRecord) => Promise<unknown>
) {
  return writeIosCompanionDatabase((db) => db.transaction((tx) => applyLocalObject(
    tx, objectType, objectId, payload, (record) => apply(tx, record)
  )));
}

async function applyLocalObject(
  db: DbPort, objectType: string, objectId: string, payload: Record<string, unknown>,
  apply: (record: LocalRecord) => Promise<unknown>, hashPayload: unknown = payload
) {
  const hostName = await iosCompanionHostName(db);
  const now = new Date().toISOString();
  const contentHash = await iosCompanionContentHash(hashPayload);
  const record = { content_hash: contentHash, deleted_at: null, object_id: objectId, object_type: objectType, payload_json: JSON.stringify(payload), updated_at: now };
  await apply(record);
  await markIosCompanionMutation({ contentHash, db, hostName, objectId, objectType, updatedAt: now });
  return { content_hash: contentHash, object_id: objectId };
}

async function writeViewState(
  key: string, payload: Record<string, unknown>, apply: (db: DbPort, hostName: string, now: string) => Promise<unknown>
) {
  return writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const hostName = await iosCompanionHostName(tx);
    const platform = getIosCompanionDatabaseOwner().platform;
    const objectId = ['session_resume', platform, 'phone', hostName, key].join(':');
    const canonical: Record<string, unknown> = { host_name: hostName, form_factor: 'phone', key, platform, scope: 'session_resume', ...payload };
    const { source: ignored, ...hashPayload } = canonical; void ignored;
    const contentHash = await iosCompanionContentHash(hashPayload);
    const now = new Date().toISOString();
    await apply(tx, hostName, now);
    await markIosCompanionMutation({ contentHash, db: tx, hostName, objectId, objectType: 'view_state', updatedAt: now });
    return { content_hash: contentHash, object_id: objectId };
  }));
}

async function mark(db: DbPort, objectType: string, objectId: string, contentHash: string, updatedAt: string) {
  const hostName = await iosCompanionHostName(db);
  return markIosCompanionMutation({ contentHash, db, hostName, objectId, objectType, updatedAt });
}

async function insertReviewLog(db: DbPort, nodeId: string, opId: string, draft: Record<string, unknown>) {
  const before = requireObject(draft.cardBefore); const after = requireObject(draft.cardAfter);
  await db.run(
    'INSERT OR IGNORE INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [createCompanionUuid(), opId, await iosCompanionHostName(db), nodeId, Number(draft.grade), String(draft.schedulerVersion), String(draft.reviewedAt), String(before.due), Number(before.stability), Number(before.difficulty), String(after.due), Number(after.stability), Number(after.difficulty)]
  );
}

function parseObject(value: string) { const parsed = JSON.parse(value) as unknown; return requireObject(parsed); }
function requireObject(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object payload.'); return value as Record<string, unknown>; }
type LocalRecord = { content_hash: string; deleted_at: null; object_id: string; object_type: string; payload_json: string; updated_at: string };
