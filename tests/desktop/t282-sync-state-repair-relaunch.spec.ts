import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion';
import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 't282-preserved-topic';
const BODY = 'T282 content survives sync metadata repair.';

function seedRetiredMetadata(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  try {
    for (const name of ['insert', 'replace', 'delete']) db.exec(`DROP TRIGGER trg_sync_state_receipt_${name}`);
    let seq = Number(db.prepare('SELECT high_water FROM sync_state_sequence').get()!.high_water);
    const state = db.prepare(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
      VALUES (?, ?, ?, 'fixture-hash', 'fixture-host', '2026-10-01', ?)`);
    for (const type of ['node', 'node_reading', 'node_review', 'import_source']) {
      state.run(type, 't282-clean-orphan', ++seq, 0);
    }
    state.run('node_reading', 't282-unsent-orphan', ++seq, 1);
    state.run('setting', 'user_space:all:all::t282-setting', ++seq, 0);
    db.prepare(`INSERT INTO sync_delivery_receipts
      (peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
       status, created_at, updated_at) VALUES ('fixture-peer', 'state', ?, 'setting', 'user_space:all:all::t282-setting',
       'fixture-hash', 'accepted', '2026-10-01', '2026-10-01')`).run(`setting:user_space:all:all::t282-setting:${seq}`);
    db.prepare(`INSERT INTO sync_delivery_receipts
      (peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
       status, created_at, updated_at) VALUES ('fixture-peer', 'state', 'setting:user_space:all:all::t282-setting:0',
       'setting', 'user_space:all:all::t282-setting', 'old-hash', 'accepted', '2026-10-01', '2026-10-01')`).run();
    db.exec('PRAGMA user_version = 120');
  } finally { db.close(); }
}

function readRepairResult(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      version: Number(db.prepare('PRAGMA user_version').get()!.user_version),
      cleanOrphans: Number(db.prepare("SELECT COUNT(*) AS count FROM sync_object_state WHERE object_id='t282-clean-orphan'").get()!.count),
      unsent: db.prepare("SELECT sync_dirty, deleted_at FROM sync_object_state WHERE object_id='t282-unsent-orphan'").get(),
      receipts: db.prepare("SELECT payload_identity FROM sync_delivery_receipts WHERE peer_id='fixture-peer'").all()
    };
  } finally { db.close(); }
}

test('repairs retired sync metadata on cold startup while preserving content and the unsent fact', async ({ desktopSession }, testInfo) => {
  const first = desktopSession.firstWindow;
  await expectWorkspaceShell(first);
  await first.evaluate(async ({ id, body }) => window.__folioleWorkspaceDebug!.seedNodes([
    { id, kind: 'topic', title: 'T282 preserved topic', content: body }
  ]), { id: NODE_ID, body: BODY });
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  expect(libraryHome).toBeTruthy();
  const root = desktopSession.target.runtimeStateRoot;
  const databasePath = path.join(libraryHome!, 'Data', 'foliole.db');
  expect(path.relative(root, databasePath).startsWith('..')).toBe(false);
  await closeDesktopApplication(desktopSession.electronApp);
  seedRetiredMetadata(databasePath);
  let second: DesktopSession | null = null;
  try {
    second = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: root }
    }) as DesktopSession;
    await expectWorkspaceShell(second.firstWindow);
    await second.firstWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), NODE_ID);
    await expect(second.firstWindow.locator('.prompt-editor-host .cm-content')).toContainText(BODY);
    expect(readRepairResult(databasePath)).toEqual({
      version: DATABASE_SCHEMA_VERSION, cleanOrphans: 0,
      unsent: { sync_dirty: 1, deleted_at: null }, receipts: [{ payload_identity: 'fixture-hash' }]
    });
    await second.firstWindow.screenshot({ path: testInfo.outputPath('t282-repaired-topic.png') });
    await closeDesktopApplication(second.electronApp);
    expect(readRepairResult(databasePath).cleanOrphans).toBe(0);
  } finally { await second?.close(); }
});
