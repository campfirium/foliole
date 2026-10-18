import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

const EXPECTED_DEVICE_PROFILE = os.hostname().trim().replace(/\.local$/iu, '') || 'Desktop client';

function readProfile(databasePath: string) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    // The host profile lives in host_name; device_id is only a legacy identity.
    const raw = database.prepare("SELECT value FROM settings WHERE key = 'host_name'").get()?.value;
    const uuid = database.prepare("SELECT value FROM settings WHERE key = 'standalone_device_uuid'").get()?.value;
    return { host: typeof raw === 'string' ? JSON.parse(raw) : null,
      uuid: typeof uuid === 'string' ? JSON.parse(uuid) : null };
  } finally {
    database.close();
  }
}

test('desktop startup owns the current host profile across a legacy identity restart', async ({ browserName }) => {
  void browserName;
  const artifactRoot = fs.mkdtempSync(path.resolve('.tmp/artifacts/desktop-device-profile-'));
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: artifactRoot };
  let session = await launchDesktopSession({ env });

  try {
    let window = session.firstWindow;
    const libraryHome = await session.electronApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME);
    if (!libraryHome) throw new Error('Desktop host did not expose its isolated library home.');
    const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
    const initialProfile = readProfile(databasePath);
    expect(initialProfile.host).toBe(EXPECTED_DEVICE_PROFILE);
    expect(initialProfile.uuid).toMatch(/^[0-9a-f-]{36}$/);
    await window.evaluate(async () => globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([{
      content: '# Host-owned device profile', id: 'host-owned-device-profile',
      kind: 'topic', title: 'Host-owned device profile'
    }]));
    await session.close();

    // Simulate a library written before host profiles: only a legacy device identity.
    const database = new DatabaseSync(databasePath);
    database.prepare("DELETE FROM settings WHERE key = 'host_name'").run();
    database.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, 'legacy')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify('desktop-device-legacy'));
    database.close();

    session = await launchDesktopSession({ env });
    window = session.firstWindow;
    expect(readProfile(databasePath)).toEqual(initialProfile);
    await expect.poll(() => window.evaluate(() =>
      globalThis.window?.__folioleWorkspaceDebug?.getNode?.('host-owned-device-profile')
    )).toMatchObject({ title: 'Host-owned device profile' });
  } finally {
    await session.close().catch(() => undefined);
    fs.rmSync(artifactRoot, { force: true, recursive: true });
  }
});
