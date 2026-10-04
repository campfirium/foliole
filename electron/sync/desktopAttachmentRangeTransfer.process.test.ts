// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import ts from 'typescript';
import { expect, it } from 'vitest';

import { ATTACHMENT_RANGE_BYTES } from '../../lib/platform/resourceAvailabilityContract.js';

import { hashResourceFile } from './resourceFileHash.js';

const run = promisify(execFile);
const worker = `
import { promises as fs } from 'node:fs';
import Database from ${JSON.stringify(pathToFileURL(path.join(process.cwd(), 'node_modules/better-sqlite3/lib/index.js')).href)};
import { createAttachmentReceiveCheckpoint } from './lib/core/sync/attachmentReceiveCheckpoint.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from './lib/core/database/syncPackProgressSchemaStatements.js';
import { receiveDesktopAttachmentRanges } from './electron/sync/desktopAttachmentRangeTransfer.js';
const [sourcePath, filePath, contentHash, mode] = process.argv.slice(2);
const db = new Database(filePath + '.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[3]);
const checkpoint = createAttachmentReceiveCheckpoint({
  query: async (sql, params) => db.prepare(sql).all(...params),
  run: async (sql, params) => db.prepare(sql).run(...params)
}, filePath, contentHash);
if (mode === 'published') checkpoint.clear = async () => {
  process.kill(process.pid, 'SIGKILL');
  await new Promise(() => {});
};
const offsets = [];
const startingRss = process.memoryUsage().rss;
let peakRss = startingRss;
const source = await fs.open(sourcePath, 'r');
const totalBytes = (await source.stat()).size;
await receiveDesktopAttachmentRanges({ filePath, contentHash, expectedBytes: totalBytes, checkpoint,
  requestRange: async (offset) => {
    offsets.push(offset);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    if (['prefix', 'tail', 'aligned', 'short'].includes(mode) && offset === 2 * 1048576) {
      if (mode === 'tail') await fs.appendFile(filePath + '.unverified', Buffer.alloc(13));
      if (mode === 'aligned') await fs.appendFile(filePath + '.unverified', Buffer.alloc(1048576, 0x52));
      if (mode === 'short') await fs.truncate(filePath + '.unverified', 1048576);
      process.kill(process.pid, 'SIGKILL');
      await new Promise(() => {});
    }
    const body = Buffer.alloc(Math.min(1048576, totalBytes - offset));
    const { bytesRead } = await source.read(body, 0, body.length, offset);
    return { body: body.subarray(0, bytesRead), totalBytes };
  }
});
await source.close();
db.close();
process.stdout.write(JSON.stringify({ offsets, startingRss, peakRss,
  finalRss: process.memoryUsage().rss }));
`;

async function compileReceiver(root: string) {
  for (const relative of ['electron/sync/desktopAttachmentRangeTransfer.ts',
    'electron/sync/resourceFileHash.ts', 'lib/platform/resourceAvailabilityContract.ts',
    'lib/platform/attachmentResource.ts',
    'lib/core/sync/attachmentReceiveCheckpoint.ts', 'lib/core/database/syncPackProgressSchemaStatements.ts']) {
    const source = await fs.readFile(path.join(process.cwd(), relative), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022
    } }).outputText;
    const destination = path.join(root, relative.replace(/\.ts$/u, '.js'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, output);
  }
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'worker.mjs'), worker);
}

async function writeSource(filePath: string, bytes: number) {
  const digest = createHash('sha256');
  const source = await fs.open(filePath, 'w');
  const chunk = Buffer.alloc(ATTACHMENT_RANGE_BYTES, 0x51);
  try {
    for (let offset = 0; offset < bytes; offset += chunk.length) {
      const part = chunk.subarray(0, Math.min(chunk.length, bytes - offset));
      await source.writeFile(part);
      digest.update(part);
    }
    await source.sync();
  } finally { await source.close(); }
  return digest.digest('hex');
}

it.each([['prefix', 3], ['tail', 3], ['aligned', 3], ['short', 3], ['prefix', 30], ['tail', 30],
  ['prefix', 300], ['tail', 300]] as const)(
  'resumes in a new process after SIGKILL with %s persisted (%s MiB)', async (mode, mebibytes) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-range-process-'));
  try {
    await compileReceiver(root);
    const sourcePath = path.join(root, 'source');
    const filePath = path.join(root, 'received');
    const bytes = ATTACHMENT_RANGE_BYTES * mebibytes + 17;
    const hash = await writeSource(sourcePath, bytes);
    const args = [path.join(root, 'worker.mjs'), sourcePath, filePath, hash];
    const options = { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 60_000 };
    await expect(run(process.execPath, [...args, mode], options))
      .rejects.toMatchObject({ signal: 'SIGKILL', stderr: '' });
    expect((await fs.stat(`${filePath}.unverified`)).size)
      .toBe(mode === 'short' ? ATTACHMENT_RANGE_BYTES
        : ATTACHMENT_RANGE_BYTES * (mode === 'aligned' ? 3 : 2) + (mode === 'tail' ? 13 : 0));
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const resumed = await run(process.execPath, [...args, 'resume'], options);
    const profile = JSON.parse(resumed.stdout) as { offsets: number[];
      startingRss: number; peakRss: number; finalRss: number };
    const firstRemaining = mode === 'short' ? 1 : 2;
    expect(profile.offsets).toEqual([0, ...Array.from({ length: mebibytes - firstRemaining + 1 },
      (_, index) => (index + firstRemaining) * ATTACHMENT_RANGE_BYTES)]);
    expect(await hashResourceFile(filePath)).toBe(hash);
    await expect(fs.stat(`${filePath}.unverified`)).rejects.toMatchObject({ code: 'ENOENT' });
    const evidence = path.join(process.cwd(), '.tmp/artifacts/T267',
      `attachment-process-${mebibytes}m-${mode}.json`);
    await fs.mkdir(path.dirname(evidence), { recursive: true });
    await fs.writeFile(evidence, JSON.stringify({ bytes, hash, mode, ...profile }, null, 2));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}, 90_000);

it('recovers in a new process when killed after publication before checkpoint cleanup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-range-published-process-'));
  try {
    await compileReceiver(root);
    const sourcePath = path.join(root, 'source');
    const filePath = path.join(root, 'received');
    const hash = await writeSource(sourcePath, ATTACHMENT_RANGE_BYTES * 3 + 17);
    const args = [path.join(root, 'worker.mjs'), sourcePath, filePath, hash];
    const options = { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 15_000 };
    await expect(run(process.execPath, [...args, 'published'], options))
      .rejects.toMatchObject({ signal: 'SIGKILL', stderr: '' });
    expect(await hashResourceFile(filePath)).toBe(hash);
    const resumed = await run(process.execPath, [...args, 'resume'], options);
    expect(JSON.parse(resumed.stdout).offsets).toEqual([]);
    expect(await hashResourceFile(filePath)).toBe(hash);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}, 40_000);
