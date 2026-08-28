import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function fixture() {
  const artifactRoot = path.resolve('.tmp/artifacts');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(artifactRoot, 't146-host-lifecycle-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'fixture.db'));
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  sqlite.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run('device_id', 'fixture-device', '2026-08-06T00:00:00Z');
  sqlite.pragma(`user_version = ${COMPANION_DATABASE_VERSION}`);
  return { port: createBetterSqliteDbPort(sqlite), sqlite };
}

describe('shared companion Host handling', () => {
  it('preserves same-Host sync markers after renaming local Host state', async () => {
    const identity = fixture();
    identity.sqlite.exec(`
      INSERT INTO sync_groups VALUES
        ('group','Group','copied-workgroup-key','2026-08-01','2026-08-01');
      INSERT INTO sync_group_devices VALUES
        ('group','fixture-device','anchor','/acceptance/library','fixture-device','ios','active',
         '2026-08-01',NULL,'2026-08-01','2026-08-01');
      INSERT INTO sync_group_local_state VALUES (1,'group','fixture-device','active','2026-08-01');
      INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES
        ('node-1','Preserved','content','2026-08-01','2026-08-01');
      INSERT INTO review_log (
        id,op_id,host_name,node_id,grade,scheduler_version,reviewed_at,due_before,
        stability_before,difficulty_before,due_after,stability_after,difficulty_after
      ) VALUES ('r','op','fixture-device','node-1',3,'v1','2026-08-01','2026-08-01',1,1,'2026-08-02',2,2);
      INSERT INTO sync_object_state
        (object_type,object_id,state_seq,content_hash,last_modified_by_host_name,updated_at,sync_dirty) VALUES
        ('view_state','host:ios:phone:fixture-device:node:node-1',1,'view-hash','fixture-device','2026-08-01',0),
        ('setting','host:ios:phone:fixture-device:handoff',2,'setting-hash','fixture-device','2026-08-01',0);
    `);

    const first = await bootstrap(identity.port, 'iPhone', '2026-08-11T00:00:00Z');
    expect(first).toMatchObject({ deviceId: 'fixture-device', hostName: 'iPhone' });
    expect(identity.sqlite.prepare('SELECT device_identity_key, device_name FROM sync_group_devices').get())
      .toEqual({ device_identity_key: 'fixture-device', device_name: 'iPhone' });
    expect(identity.sqlite.prepare('SELECT host_name FROM review_log').pluck().get()).toBe('fixture-device');
    expect(identity.sqlite.prepare('SELECT workgroup_key FROM sync_groups').pluck().get())
      .toBe('copied-workgroup-key');

    await expect(bootstrap(identity.port, 'iPhone', '2026-08-12T00:00:00Z'))
      .resolves.toMatchObject({ deviceId: 'fixture-device', hostName: 'iPhone' });
    expect(identity.sqlite.prepare(
      "SELECT object_type FROM sync_object_state WHERE object_id LIKE '%:iPhone:%' ORDER BY object_type"
    ).pluck().all()).toEqual(['setting', 'view_state']);
    identity.sqlite.close();
  });

  it('keeps an allocated execution identity across Host changes', async () => {
    const identity = fixture();
    identity.sqlite.prepare("UPDATE companion_meta SET value = 'iPhone 2' WHERE key = 'device_id'").run();
    identity.sqlite.exec(`
      INSERT INTO sync_groups VALUES ('group','Group','workgroup-key','2026-08-01','2026-08-01');
      INSERT INTO sync_group_devices VALUES
        ('group','iPhone 2','anchor','/acceptance/library','iPhone 2','ios','active',
         '2026-08-01',NULL,'2026-08-01','2026-08-01');
      INSERT INTO sync_group_local_state VALUES (1,'group','iPhone 2','active','2026-08-01');
    `);
    await expect(bootstrap(identity.port, 'iPhone', '2026-08-11T00:00:00Z'))
      .resolves.toMatchObject({ deviceId: 'iPhone 2', hostName: 'iPhone' });
    identity.sqlite.prepare('DELETE FROM sync_group_local_state').run();
    await expect(bootstrap(identity.port, 'iPhone 3', '2026-08-12T00:00:00Z'))
      .resolves.toMatchObject({ deviceId: 'iPhone 2', hostName: 'iPhone 3' });
    identity.sqlite.close();
  });
});

function bootstrap(port: ReturnType<typeof createBetterSqliteDbPort>, expectedHostName: string, now: string) {
  return bootstrapCompanionDatabase(port, { allowCreate: false, expectedHostName, now });
}
