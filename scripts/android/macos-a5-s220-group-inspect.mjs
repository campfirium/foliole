import fs from 'node:fs';
import path from 'node:path';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';

export async function inspectS220A5Group({ assertFixed, paths, serial }) {
  assertFixed();
  const snapshot = await collectAndroidDeviceSnapshot({ adb: paths.adb,
    appId: S220_APP_ID, includeAttachments: true, includeAttachmentFacts: true,
    includeEvents: false, serial,
    tables: ['nodes', 'node_review', 'review_log', 'sync_groups', 'sync_group_devices',
      'attachments'],
    databaseInspector: (db) => ({
      attachmentColumns: db.prepare('PRAGMA table_info(attachments)').all()
        .map((column) => column.name),
      resources: db.prepare('SELECT * FROM attachments ORDER BY id').all(),
      bodies: db.prepare(`SELECT n.id, n.title, n.kind, n.body_blob_hash,
        cb.availability, LENGTH(cbd.data) AS body_bytes
        FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
        LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
        WHERE n.deleted_at IS NULL ORDER BY n.id`).all(),
      group: db.prepare(`SELECT group_id, local_device_identity_key, state
        FROM sync_group_local_state WHERE singleton_id = 1`).get() ?? null,
      members: db.prepare(`SELECT group_id, device_identity_key, platform, state,
        last_seen_at FROM sync_group_devices ORDER BY platform, device_identity_key`).all(),
      metaKeys: db.prepare('SELECT key FROM companion_meta ORDER BY key').all()
        .map((row) => row.key),
      review: db.prepare(`SELECT node_id, due, state, reps, last_review_at
        FROM node_review ORDER BY node_id`).all(),
      reviewTargets: db.prepare(`SELECT n.id, n.title, n.kind, n.parent_id,
          n.deleted_at, n.current_version_id, nr.due, rd.next_at, rd.state AS reading_state,
          LENGTH(n.content) AS content_length, n.body_blob_hash,
          cb.availability AS body_availability, LENGTH(cbd.data) AS body_bytes
        FROM nodes n LEFT JOIN node_review nr ON nr.node_id = n.id
        LEFT JOIN node_reading rd ON rd.node_id = n.id
        LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
        LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
        WHERE nr.due IS NOT NULL OR rd.next_at IS NOT NULL
        ORDER BY n.title, n.id`).all(),
      journeyFacts: db.prepare(`SELECT n.id, n.title, n.kind, n.current_version_id,
          n.body_blob_hash, cb.availability AS body_availability,
          LENGTH(cbd.data) AS body_bytes
        FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
        LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
        WHERE n.title LIKE 'Multi-device sync % fact' AND n.deleted_at IS NULL
        ORDER BY n.title`).all()
    }) });
  if (snapshot.database?.integrity !== 'ok') {
    throw new Error(`S220 group snapshot is not integral: ${JSON.stringify(snapshot.database)}`);
  }
  const filePath = path.join(paths.artifactsRoot, 'S220', 'a5-group-inspect.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ capturedAt: new Date().toISOString(),
    attachments: snapshot.attachments ? { sha256: snapshot.attachments.sha256,
      size: snapshot.attachments.size, files: snapshot.attachments.files } : null,
    counts: snapshot.database.counts, inspection: snapshot.database.inspection,
    packageId: S220_APP_ID, serial }, null, 2)}\n`, 'utf8');
  return filePath;
}
