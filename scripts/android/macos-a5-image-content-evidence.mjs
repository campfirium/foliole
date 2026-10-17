import assert from 'node:assert/strict';
import path from 'node:path';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { ACCEPTANCE_APP_ID } from './macos-a5-acceptance-package-cleanup.mjs';
import { openReadonlySqliteDatabase } from './sqlite-readonly.mjs';

export function readImageContentFact(database, nodeId) {
  return database.prepare(`SELECT id, content, resource_references, current_version_id,
    (SELECT count(*) FROM node_sync_versions v WHERE v.object_id = n.id) AS versions
    FROM nodes n WHERE id = ?`).get(nodeId);
}

export async function readMacImageFact(evidenceRoot, nodeId) {
  const db = await openReadonlySqliteDatabase(path.join(evidenceRoot, 'macos-library/Data/foliole.db'));
  try { return readImageContentFact(db, nodeId); } finally { db.close(); }
}

export async function readAndroidImageFact(args, nodeId) {
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', ACCEPTANCE_APP_ID]);
  const snapshot = await collectAndroidDeviceSnapshot({ adb: args.paths.adb, serial: args.serial,
    appId: ACCEPTANCE_APP_ID, includeAttachments: false, includeEvents: false, tables: ['nodes'],
    databaseInspector: db => readImageContentFact(db, nodeId) });
  if (snapshot.database?.integrity !== 'ok' || !snapshot.database.inspection) {
    throw new Error(`image_content_android_snapshot_unavailable: ${snapshot.database?.error ?? 'missing'}`);
  }
  return snapshot.database.inspection;
}

export function assertImageContentFact(fact, expectedContent, imageName) {
  assert.ok(fact, 'Image content fact is missing');
  assert.equal(fact.content, expectedContent);
  const references = JSON.parse(fact.resource_references);
  assert.equal(references.length, 1);
  assert.equal(references[0].original_name, imageName);
  assert.equal(references[0].role, 'image');
  assert.ok(expectedContent.includes(`asset://${references[0].storage_key}`));
  return references[0];
}
