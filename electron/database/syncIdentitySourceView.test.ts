import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { readReadySyncIdentityChangedPage } from '../../lib/core/sync/syncIdentityChangedPage.js';
import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import {
  readReadySyncIdentityPage, readReadySyncIdentitySummary
} from '../../lib/core/sync/syncIdentityIndexMaintenance.js';
import { readSyncIdentityNodeFactGlobalPage } from '../../lib/core/sync/syncIdentityNodeFactGlobalRead.js';
import {
  readSyncIdentityNodeFactSummary } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';

import { createSyncIdentitySourceView, openSyncIdentitySourceView } from './syncIdentitySourceView.js';
import { loadPackRowsByIdentity } from './syncPackRowsByIdentity.js';

it('pages same-time changed IDs by identity without skipping a boundary row', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-changes-'));
  const source = new Database(':memory:');
  try {
    for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) source.exec(statement);
    source.exec(`INSERT INTO nodes (id, title, created_at, updated_at)
      VALUES ('node-a', 'A', 't1', 't1'), ('node-b', 'B', 't1', 't1');
      INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
        last_modified_by_host_name, updated_at) VALUES
        ('node', 'node-a', 1, 'a', 'Mac', 't1'),
        ('node', 'node-b', 2, 'b', 'Mac', 't1')`);
    const view = await createSyncIdentitySourceView(source, path.join(root, 'view.db'));
    try {
      const first = await readReadySyncIdentityChangedPage(view.port, 't1', null, 1);
      const second = await readReadySyncIdentityChangedPage(view.port, 't1', first.nextAfter, 1);
      expect(first.entries.map((row) => row.object_id)).toEqual(['node-a']);
      expect(second.entries.map((row) => row.object_id)).toEqual(['node-b']);
      expect(second.nextAfter).toBeNull();
      expect((await readReadySyncIdentityChangedPage(view.port, 't2', null)).entries).toEqual([]);
    } finally { view.close(); }
  } finally { source.close(); await fs.rm(root, { recursive: true, force: true }); }
});

it('publishes a fixed identity source view after bounded index preparation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-view-'));
  const source = new Database(':memory:');
  try {
    for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) source.exec(statement);
    source.exec(`INSERT INTO nodes (id, title, created_at, updated_at)
      VALUES ('node-a', 'A', 't1', 't1')`);
    source.exec(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at)
      VALUES ('node', 'node-a', 1, 'v1', 'h1', 'Mac', 't1')`);
    const first = await createSyncIdentitySourceView(source, path.join(root, 'first.db'));
    const partition = syncIdentityPartition('node', 'node-a');
    try {
      const summary = await readReadySyncIdentitySummary(first.port);
      expect(summary).toHaveLength(256);
      expect(summary[partition]?.row_count).toBe(1);
      const page = await readReadySyncIdentityPage(first.port, partition, null);
      expect(page.entries).toMatchObject([{ object_type: 'node', object_id: 'node-a' }]);
      source.exec(`UPDATE sync_object_state SET content_hash = 'h2', current_version_id = 'v2',
        state_seq = 2 WHERE object_type = 'node' AND object_id = 'node-a'`);
      const reopened = openSyncIdentitySourceView(path.join(root, 'first.db'), first.sourceViewId);
      try {
        expect((await readReadySyncIdentityPage(reopened.port, partition, null)).entries[0]?.fingerprint)
          .toBe(page.entries[0]?.fingerprint);
        const selected = loadPackRowsByIdentity(reopened.driver, page.entries);
        expect(selected.stateRows).toMatchObject([{ object_id: 'node-a', content_hash: 'h1' }]);
      } finally { reopened.close(); }
      const second = await createSyncIdentitySourceView(source, path.join(root, 'second.db'));
      try {
        expect((await readReadySyncIdentityPage(second.port, partition, null)).entries[0]?.fingerprint)
          .not.toBe(page.entries[0]?.fingerprint);
      } finally { second.close(); }
    } finally { first.close(); }
  } finally {
    source.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('detects a retained branch without changing the current object fingerprint', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-facts-'));
  const source = new Database(':memory:');
  try {
    for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) source.exec(statement);
    source.exec(`INSERT INTO nodes (id, title, current_version_id, created_at, updated_at)
      VALUES ('node-a', 'A', 'v1', 't1', 't1');
      INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at)
      VALUES ('node', 'node-a', 1, 'v1', 'h1', 'Mac', 't1');
      INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES ('v1', 'node-a', 'Mac', 't1', 'h1', 'body',
        '{"id":"node-a","title":"A","content":"body"}')`);
    const first = await createSyncIdentitySourceView(source, path.join(root, 'first.db'));
    const partition = syncIdentityPartition('node', 'node-a');
    try {
      const current = (await readReadySyncIdentityPage(first.port, partition, null)).entries[0]!;
      const initialFact = (await readSyncIdentityNodeFactGlobalPage(first.port, null)).entries[0]!;
      source.exec(`INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at,
         content_hash, body_text, snapshot_json)
        VALUES ('v2', 'node-a', 'v1', 'Other', 't2', 'h2', 'branch',
          '{"id":"node-a","title":"Branch","content":"branch"}');
        INSERT INTO node_sync_version_parents VALUES ('v2', 'v1', 0)`);
      const second = await createSyncIdentitySourceView(source, path.join(root, 'second.db'));
      try {
        expect((await readReadySyncIdentityPage(second.port, partition, null)).entries[0]?.fingerprint)
          .toBe(current.fingerprint);
        const nextFact = (await readSyncIdentityNodeFactGlobalPage(second.port, null)).entries[0]!;
        expect(nextFact.fingerprint).not.toBe(initialFact.fingerprint);
        expect((await readSyncIdentityNodeFactSummary(second.port))[0]?.digest)
          .not.toBe((await readSyncIdentityNodeFactSummary(first.port))[0]?.digest);
      } finally { second.close(); }
    } finally { first.close(); }
  } finally { source.close(); await fs.rm(root, { recursive: true, force: true }); }
});

it('rejects a reopened source view whose indexed fact proof changed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-proof-'));
  const source = new Database(':memory:');
  const viewPath = path.join(root, 'view.db');
  try {
    for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) source.exec(statement);
    const view = await createSyncIdentitySourceView(source, viewPath);
    const viewId = view.sourceViewId;
    view.close();
    const changed = new Database(viewPath);
    try {
      changed.prepare(`UPDATE sync_identity_node_fact_summary SET proof_digest = ?
        WHERE partition = 0`).run('a'.repeat(64));
    } finally { changed.close(); }
    expect(() => openSyncIdentitySourceView(viewPath, viewId))
      .toThrow('sync_identity_source_view_changed');
  } finally { source.close(); await fs.rm(root, { recursive: true, force: true }); }
});
