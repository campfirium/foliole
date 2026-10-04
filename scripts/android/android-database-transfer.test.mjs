// @vitest-environment node
/* global process */

import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { pullDatabaseFile } from './android-device-snapshot.mjs';

const fixture = vi.hoisted(() => ({ body: '' }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  const command = (args) => ['-e', args.includes('exec-out') ? fixture.body : ''];
  return { ...actual,
    execFile: (_file, args, options, callback) =>
      actual.execFile(process.execPath, command(args), options, callback),
    spawn: (_file, args, options) => actual.spawn(process.execPath, command(args), options)
  };
});

async function withFakeAdb(body, check) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-database-transfer-'));
  fixture.body = body;
  try {
    await check({ adb: 'fixture-adb', appId: 'test.app', serial: 'fixed-device' },
      path.join(root, 'snapshot.db'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it('preserves database bytes beyond the buffered command output limit', async () => {
  await withFakeAdb(`
  const { once } = require('node:events');
  (async () => {
    for (let index = 0; index < 92; index += 1) {
      if (!process.stdout.write(Buffer.alloc(1024 * 1024, index))) await once(process.stdout, 'drain');
    }
  })();
`, async (options, destination) => {
    expect(await pullDatabaseFile(options, 'databases/companion.db', destination)).toBe(true);
    expect((await stat(destination)).size).toBe(92 * 1024 * 1024);
    const file = await open(destination, 'r');
    try {
      for (let index = 0; index < 92; index += 1) {
        const { buffer } = await file.read({ length: 1, position: index * 1024 * 1024 });
        expect(buffer[0]).toBe(index);
      }
    } finally { await file.close(); }
  });
}, 30_000);

it('rejects a failed transfer and removes its incomplete database', async () => {
  await withFakeAdb(`
  process.stdout.write('partial');
  process.stderr.write('transfer failed');
  process.exitCode = 2;
`, async (options, destination) => {
    await expect(pullDatabaseFile(options, 'databases/companion.db', destination))
      .rejects.toThrow('transfer failed');
    await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
