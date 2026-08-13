#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import BetterSqlite3 from 'better-sqlite3';
import {
  identityFingerprint, inspectPairSyncRecoveryWorkspace
} from '../android/android-pair-sync-recovery-readiness.mjs';
import { inspectSyncFromZeroDatasetFacts } from '../sync-group/sync-from-zero-dataset-inspect.mjs';

function identitiesByKind(rows) {
  return rows.reduce((result, row) => {
    result[row.device_kind] ??= [];
    result[row.device_kind].push(identityFingerprint(row.device_id));
    return result;
  }, {});
}

function departedDeviceIdentities(database) {
  return identitiesByKind(database.prepare(`SELECT DISTINCT members.device_kind, members.device_id
    FROM sync_group_member_departures departures
    JOIN sync_group_members members
      ON members.group_id = departures.group_id AND members.device_id = departures.device_id
    WHERE members.state = 'left' ORDER BY members.device_kind, members.device_id`).all());
}

function activeDeviceIdentities(database) {
  return identitiesByKind(database.prepare(`SELECT DISTINCT device_kind, device_id
    FROM sync_group_members WHERE state = 'active' ORDER BY device_kind, device_id`).all());
}

function departedAtByDeviceIdentity(database) {
  const rows = database.prepare(`SELECT members.device_id, departures.left_at
    FROM sync_group_member_departures departures
    JOIN sync_group_members members
      ON members.group_id = departures.group_id AND members.device_id = departures.device_id
    ORDER BY departures.left_at, members.device_id`).all();
  return Object.fromEntries(rows.map(({ device_id, left_at }) => [identityFingerprint(device_id), left_at]));
}

function journeyFactUpdates(database) {
  const rows = database.prepare(`SELECT id, updated_at FROM nodes WHERE deleted_at IS NULL AND (
    id GLOB 'multi-device-sync-[abc]-*' OR title GLOB 'Multi-device sync [ABC] fact*'
    OR title GLOB 'T121 [ABC] fact *') ORDER BY updated_at, id`).all();
  return Object.fromEntries(rows.map(({ id, updated_at }) => [id, updated_at]));
}

function storedDesktopDeviceIdentity(database) {
  const row = database.prepare(`SELECT value FROM settings
    WHERE key IN ('device_id', 'desktop_device_id')
    ORDER BY CASE key WHEN 'device_id' THEN 0 ELSE 1 END LIMIT 1`).get();
  if (typeof row?.value !== 'string') return null;
  let value = row.value;
  try { value = JSON.parse(value); } catch { /* legacy settings may store plain text */ }
  return typeof value === 'string' && value.trim() ? identityFingerprint(value.trim()) : null;
}

function peerProgress(database) {
  const cursors = database.prepare(`SELECT peer_id, stream_name, cursor_value
    FROM sync_peer_cursors ORDER BY stream_name, peer_id`).all();
  const deliveryRows = database.prepare(`SELECT status, COUNT(*) AS count
    FROM sync_delivery_receipts GROUP BY status ORDER BY status`).all();
  const receiveCursor = cursors.filter(({ stream_name }) => stream_name === 'state')
    .reduce((maximum, { cursor_value }) => Math.max(maximum, Number(cursor_value) || 0), 0);
  return {
    deliveryStatusCounts: Object.fromEntries(deliveryRows.map(({ count, status }) => [status, Number(count)])),
    peerCursors: cursors.map(({ cursor_value, peer_id, stream_name }) => ({
      cursorValue: cursor_value, peerFingerprint: identityFingerprint(peer_id), streamName: stream_name
    })),
    receiveCursor
  };
}

export function inspectSyncGroupRecoveryDatabase(databasePath, factIds = []) {
  const db = new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
  try {
    const count = (sql) => Number(db.prepare(sql).pluck().get() ?? 0);
    const local = db.prepare(`SELECT local.group_id, local.member_state, groups.timeline_id
      FROM sync_group_local_state local
      LEFT JOIN sync_groups groups ON groups.group_id = local.group_id
      WHERE local.singleton_id = 1 LIMIT 1`).get();
    const identity = inspectPairSyncRecoveryWorkspace(db);
    const factExists = db.prepare('SELECT COUNT(*) FROM nodes WHERE id = ? AND deleted_at IS NULL').pluck();
    const facts = Object.fromEntries(factIds.map((id) => [id, Number(factExists.get(id)) === 1]));
    return {
      ...inspectSyncFromZeroDatasetFacts(db),
      ...peerProgress(db),
      activeDeviceIdentities: activeDeviceIdentities(db),
      activeMemberCount: count("SELECT COUNT(*) FROM sync_group_members WHERE state = 'active'"),
      attachmentCount: count('SELECT COUNT(*) FROM attachments'),
      contentBlobCount: count('SELECT COUNT(*) FROM content_blobs'),
      departedAtByDeviceIdentity: departedAtByDeviceIdentity(db),
      departedDeviceIdentities: departedDeviceIdentities(db),
      deviceIdentity: storedDesktopDeviceIdentity(db) ?? identity.deviceIdentityFingerprint,
      integrity: db.prepare('PRAGMA integrity_check').pluck().get(),
      journeyFacts: identity.journeyFacts,
      journeyFactUpdates: journeyFactUpdates(db),
      facts,
      localGroupId: local?.group_id ?? null,
      localMemberState: local?.member_state ?? null,
      localTimelineId: local?.timeline_id ?? null,
      missingAttachmentCount: count("SELECT COUNT(*) FROM attachment_blobs WHERE availability != 'cached'"),
      missingContentBlobCount: count(`SELECT COUNT(*) FROM content_blobs cb
        LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`),
      maxStateSeq: count('SELECT MAX(state_seq) FROM sync_object_state'),
      nodeCount: count('SELECT COUNT(*) FROM nodes'),
      reviewLogCount: count('SELECT COUNT(*) FROM review_log'),
      syncDeliveryReceiptCount: count('SELECT COUNT(*) FROM sync_delivery_receipts'),
      syncPeerCursorCount: count('SELECT COUNT(*) FROM sync_peer_cursors'),
      userNodeCount: count(`SELECT COUNT(*) FROM nodes
        WHERE deleted_at IS NULL AND id NOT IN ('special-inbox', 'special-virtual-root')`)
    };
  } finally { db.close(); }
}

function main(argv) {
  if (argv.length < 1) throw new Error('usage: electron inspect.mjs <database-path> [fact-id...]');
  console.log(JSON.stringify(inspectSyncGroupRecoveryDatabase(path.resolve(argv[0]), argv.slice(1))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`[sync-group-recovery-inspect] ${error.message}`);
    process.exitCode = 1;
  }
}
