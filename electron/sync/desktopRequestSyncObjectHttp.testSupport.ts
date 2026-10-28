import type Database from 'better-sqlite3';

export function seedMembership(sqlite: Database.Database, device: 'peer' | 'local') {
  sqlite.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', ?, 'now', 'now')")
      .run(Buffer.alloc(32, 7).toString('base64url'));
  sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(device);
  sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run(`${device}-epoch`);
  sqlite.exec(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
        device_name, platform, state, joined_at, updated_at)
      VALUES ('group', 'peer', 'peer-anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
        ('group', 'local', 'local-anchor', '/local', 'Local', 'mac', 'active', 'now', 'now')`);
}
