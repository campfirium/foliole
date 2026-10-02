import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion';
import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 't297-preserved-topic';
const BODY = 'Content survives completed confirmation retirement.';

function seedPreviousSchema(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`DROP TABLE node_version_confirmation_state;
      INSERT INTO node_version_device_revisions VALUES ('group', 'peer', 'epoch', 1, 'completed', NULL, 'now');
      INSERT INTO node_version_pack_receipts VALUES
        ('completed', 'topic', 'group', 'peer', 'version', 'applied', 'version', 'epoch', 1, 'now');
      INSERT INTO node_version_inbound_receipts VALUES
        ('delivered', 'group', 'source', 'target', 'epoch', 1, '[]', 'now', 'now'),
        ('pending', 'group', 'source', 'target', 'epoch', 2, '[]', 'now', NULL);
      PRAGMA user_version = 125;`);
  } finally { db.close(); }
}

function readConfirmationState(databasePath: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      version: Number(db.prepare('PRAGMA user_version').get()!.user_version),
      receipts: db.prepare('SELECT pack_id FROM node_version_inbound_receipts ORDER BY pack_id').all(),
      completed: Number(db.prepare('SELECT COUNT(*) AS count FROM node_version_pack_receipts').get()!.count),
      checkpoints: db.prepare('SELECT pack_id, length(receipt_digest) AS bytes FROM node_version_confirmation_state').all()
    };
  } finally { db.close(); }
}

test('cold startup retires completed confirmations while preserving content and an undelivered confirmation', async ({ desktopSession }) => {
  await expectWorkspaceShell(desktopSession.firstWindow);
  await desktopSession.firstWindow.evaluate(async ({ id, body }) => window.__folioleWorkspaceDebug!.seedNodes([
    { id, kind: 'topic', title: 'Preserved topic', content: body }
  ]), { id: NODE_ID, body: BODY });
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  expect(libraryHome).toBeTruthy();
  const root = desktopSession.target.runtimeStateRoot;
  const databasePath = path.join(libraryHome!, 'Data', 'foliole.db');
  expect(path.relative(root, databasePath).startsWith('..')).toBe(false);
  await closeDesktopApplication(desktopSession.electronApp);
  seedPreviousSchema(databasePath);
  let second: DesktopSession | null = null;
  try {
    second = await launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: root } }) as DesktopSession;
    await expectWorkspaceShell(second.firstWindow);
    await second.firstWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), NODE_ID);
    await expect(second.firstWindow.locator('.prompt-editor-host .cm-content')).toContainText(BODY);
    expect(readConfirmationState(databasePath)).toEqual({ version: DATABASE_SCHEMA_VERSION,
      receipts: [{ pack_id: 'pending' }], completed: 0, checkpoints: [{ pack_id: 'completed', bytes: 64 }] });
    await closeDesktopApplication(second.electronApp);
    expect(readConfirmationState(databasePath).receipts).toEqual([{ pack_id: 'pending' }]);
  } finally { await second?.close(); }
});
