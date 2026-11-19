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

function dailyLogName(daysAgo: number) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - daysAgo);
  return `runtime-${day.toISOString().slice(0, 10)}.ndjson`;
}

test('startup applies daily diagnostic retention to existing files without a new warning', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-runtime-retention-'));
  const logs = path.join(root, 'logs');
  const recent = path.join(logs, dailyLogName(1));
  const expired = path.join(logs, dailyLogName(8));
  const unrelated = path.join(logs, 'runtime-notes.ndjson');
  const line = `${JSON.stringify({ event: 'older-warning', payload: { detail: 'x'.repeat(20_000) } })}\n`;
  let session: DesktopSession | undefined;
  try {
    await fs.mkdir(logs);
    await fs.writeFile(recent, line.repeat(60) + '{"event":"latest-warning"}\n{"incomplete":');
    await fs.writeFile(expired, line);
    await fs.writeFile(unrelated, 'notes');
    session = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: root, FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '0' }
    });
    expect(session.appReady.reported).toBe(true);
    await expect.poll(async () => (await fs.stat(recent)).size).toBeLessThanOrEqual(1024 * 1024);
    const events = (await fs.readFile(recent, 'utf8')).trim().split('\n').map(record => JSON.parse(record).event);
    expect(events.at(-1)).toBe('latest-warning');
    await expect(fs.stat(expired)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(unrelated, 'utf8')).resolves.toBe('notes');
  } finally {
    await session?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
