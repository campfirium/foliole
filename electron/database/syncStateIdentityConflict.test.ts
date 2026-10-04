import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ANDROID_COMPANION_MUTATION_DEFINITIONS } from '../../lib/core/database/androidCompanionMutationDefinitions.js';
import { markIosCompanionMutation } from '../../src/shared/platform/companion/runtime/iosCompanionMutationState.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('preserves another object when a state sequence collides', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL UNIQUE,
      current_version_id TEXT, content_hash TEXT NOT NULL, base_content_hash TEXT,
      last_modified_by_host_name TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, sync_dirty INTEGER NOT NULL,
      PRIMARY KEY (object_type, object_id)
    )`);
    const upsert = db.prepare(ANDROID_COMPANION_MUTATION_DEFINITIONS.syncStateUpsert);
    const write = (id: string, seq: number) => upsert.run(
      'setting', id, seq, null, `hash-${id}`, null, 'device', '2026-10-03T00:00:00Z', null, 1
    );
    write('first', 1);
    expect(() => write('second', 1)).toThrow();
    expect(db.prepare('SELECT object_id FROM sync_object_state').all()).toEqual([{ object_id: 'first' }]);
    write('first', 2);
    expect(db.prepare('SELECT object_id, state_seq FROM sync_object_state').all())
      .toEqual([{ object_id: 'first', state_seq: 2 }]);
  } finally {
    db.close();
  }
});

it('keeps existing state when an iOS write encounters a sequence collision', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE sync_state_sequence (singleton_id INTEGER PRIMARY KEY, high_water INTEGER);
      INSERT INTO sync_state_sequence VALUES (1, 1);
      CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER UNIQUE,
        current_version_id TEXT, content_hash TEXT, base_content_hash TEXT,
        last_modified_by_host_name TEXT, updated_at TEXT, deleted_at TEXT, sync_dirty INTEGER,
        PRIMARY KEY (object_type, object_id));
      INSERT INTO sync_object_state VALUES
        ('setting', 'existing', 2, NULL, 'hash-old', NULL, 'device', '2026-01-01', NULL, 1);`);
    await expect(markIosCompanionMutation({ contentHash: 'hash-new',
      db: createBetterSqliteDbPort(db), hostName: 'device', objectId: 'new',
      objectType: 'setting', updatedAt: '2026-10-03' })).rejects.toThrow();
    expect(db.prepare('SELECT object_id FROM sync_object_state').all())
      .toEqual([{ object_id: 'existing' }]);
  } finally {
    db.close();
  }
});
