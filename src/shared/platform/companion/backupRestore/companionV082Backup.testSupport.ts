import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

const V082_LIBRARY = fs.readFileSync(path.resolve('electron/database/fixtures/companion-android-v0.8.2/library.sql'), 'utf8');
export const V082_IMAGE_A = `${'a'.repeat(64)}.png`;
export const V082_IMAGE_B = `${'b'.repeat(64)}.jpg`;
const NOW = '2026-11-21T00:00:00Z';

/** A library as an Android v0.8.2 phone wrote it: in a sync group, with a reading position and two images. */
export function writeV082Backup(file: string) {
  const sqlite = new Database(file);
  sqlite.exec(V082_LIBRARY);
  sqlite.exec(`UPDATE companion_meta SET value = 'Main Phone' WHERE key IN ('device_id', 'host_name');
    INSERT INTO companion_meta (key, value, updated_at) VALUES
      ('workspace_sync_endpoint_url', 'http://main.local', '${NOW}'),
      ('sync_state_cursor', 'main-cursor', '${NOW}'),
      ('folder_backup_automatic', '1', '${NOW}'),
      ('folder_attachment_backup_profile', 'main-folder', '${NOW}');
    INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES ('topic-1', 'special-inbox', 'topic', 'Images', '![a](asset://${V082_IMAGE_A}) ![b](asset://${V082_IMAGE_B})',
        '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
    INSERT INTO node_reading_host_state (node_id, host_name, reading_position, updated_at)
      VALUES ('topic-1', 'Main Phone', 42, '${NOW}');
    INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
      VALUES ('group-1', 'Home', 'key', '${NOW}', '${NOW}');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
      VALUES ('group-1', 'main-identity', 'main-anchor', '/data/main', 'Main Phone', 'android', 'active', '${NOW}', '${NOW}');
    INSERT INTO sync_group_local_state (singleton_id, group_id, local_device_identity_key, state, updated_at)
      VALUES (1, 'group-1', 'main-identity', 'active', '${NOW}');`);
  sqlite.pragma('user_version = 117');
  return sqlite;
}
