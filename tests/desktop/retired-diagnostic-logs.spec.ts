import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';

const retired = [
  'reading-position.ndjson',
  'reading-position.ndjson.tmp',
  'windows/window-state-lifecycle.ndjson',
  'windows/renderer-state.ndjson',
  'windows/renderer-state.ndjson.tmp',
  'import/import-2026-11-18.log'
];
const preserved = ['native-boot-events.ndjson.backup', 'windows/another.ndjson', 'import/import-notes.log'];

test('ordinary desktop startup removes retired diagnostics and preserves neighboring files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-retired-diagnostics-'));
  const logs = path.join(root, 'logs');
  const directory = path.join(logs, 'import/import-2026-11-17.log');
  const original = path.join(root, 'original.txt');
  const link = path.join(logs, 'import/import-2026-11-16.log');
  let session: DesktopSession | undefined;
  try {
    for (const file of [...retired, ...preserved]) {
      const target = path.join(logs, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, 'previous run');
    }
    await fs.mkdir(directory);
    await fs.writeFile(original, 'original');
    if (process.platform !== 'win32') await fs.symlink(original, link);

    session = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: root, FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '0' }
    });
    await expect.poll(async () => {
      const existing = await Promise.allSettled(retired.map(file => fs.stat(path.join(logs, file))));
      return existing.map(result => result.status === 'rejected' ? result.reason.code : 'present');
    }).toEqual(retired.map(() => 'ENOENT'));
    expect(session.appReady.reported).toBe(true);
    for (const file of preserved) {
      await expect(fs.readFile(path.join(logs, file), 'utf8')).resolves.toBe('previous run');
    }
    expect((await fs.stat(directory)).isDirectory()).toBe(true);
    await expect(fs.readFile(original, 'utf8')).resolves.toBe('original');
    if (process.platform !== 'win32') await expect(fs.readlink(link)).resolves.toBe(original);
  } finally {
    await session?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
