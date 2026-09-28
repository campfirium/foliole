// @vitest-environment node

import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { afterEach, expect, it } from 'vitest';

import {
  SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION,
  SYNC_PACK_PAYLOAD_SCHEMA_VERSION
} from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from '../../lib/core/sync/syncPackManifest.js';
import { writeStoredZip } from '../diagnostics/zipStore.js';

import { extractSyncPackDatabase, extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
});

it('rejects a different schema version before writing an incoming database', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-schema-'));
  const zipPath = path.join(tempRoot, 'incoming.syncpack');
  const outputPath = path.join(tempRoot, 'incoming.db');
  const manifest = {
    database_file: SYNC_PACK_DATABASE_ENTRY,
    format: SYNC_PACK_FORMAT,
    format_version: SYNC_PACK_FORMAT_VERSION,
    from_peer_id: 'authorization-source',
    schema_version: SYNC_PACK_PAYLOAD_SCHEMA_VERSION - 1,
    to_peer_id: 'authorization-target'
  };
  await writeStoredZip(zipPath, [
    { content: Buffer.from(JSON.stringify(manifest)), name: 'manifest.json' },
    { content: Buffer.from('not-read'), name: SYNC_PACK_DATABASE_ENTRY }
  ]);

  await expect(extractSyncPackDatabase({
    body: await fs.readFile(zipPath),
    expectedPeerId: 'authorization-target',
    expectedSourcePeerId: 'authorization-source',
    outputPath
  })).rejects.toThrow('unsupported_sync_pack_schema_version');
  await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects a v4 pack before writing an incoming database', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-format-'));
  const zipPath = path.join(tempRoot, 'incoming.syncpack');
  const outputPath = path.join(tempRoot, 'incoming.db');
  const manifest = {
    database_file: SYNC_PACK_DATABASE_ENTRY,
    format: SYNC_PACK_FORMAT,
    format_version: 4,
    from_peer_id: 'authorization-source',
    schema_version: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
    to_peer_id: 'authorization-target'
  };
  await writeStoredZip(zipPath, [
    { content: Buffer.from(JSON.stringify(manifest)), name: 'manifest.json' },
    { content: Buffer.from('not-read'), name: SYNC_PACK_DATABASE_ENTRY }
  ]);

  await expect(extractSyncPackDatabase({
    body: await fs.readFile(zipPath),
    expectedPeerId: 'authorization-target',
    expectedSourcePeerId: 'authorization-source',
    outputPath
  })).rejects.toThrow('invalid_sync_pack_manifest');
  await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('checks a file-backed pack before publishing its decompressed database', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-file-'));
  const archivePath = path.join(tempRoot, 'incoming.syncpack');
  const outputPath = path.join(tempRoot, 'incoming.db');
  const database = randomBytes(1024 * 1024 + 11);
  const compressed = deflateSync(database);
  const sha = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const manifest = {
    compression: 'zlib', database_file: SYNC_PACK_DATABASE_ENTRY,
    database_compressed_sha256: sha(compressed), database_uncompressed_sha256: sha(database),
    format: SYNC_PACK_FORMAT, format_version: SYNC_PACK_FORMAT_VERSION,
    from_peer_id: 'source', from_state_seq: 0, frontier_state_seq: 1,
    pack_id: 'pack', schema_version: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
    source_epoch: 'source-epoch', tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name, row_count: 0 })),
    to_peer_id: 'target', to_state_seq: 1
  };
  await writeStoredZip(archivePath, [
    { content: Buffer.from(JSON.stringify(manifest)), name: 'manifest.json' },
    { content: compressed, name: SYNC_PACK_DATABASE_ENTRY }
  ]);
  const args = { archivePath, expectedPeerId: 'target', expectedSourcePeerId: 'source', outputPath };
  await expect(extractSyncPackDatabaseFromFile({ ...args, maxDatabaseBytes: 1024 }))
    .rejects.toThrow('sync_pack_database_limit_exceeded');
  await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await extractSyncPackDatabaseFromFile(args)).toMatchObject({
    fromStateSeq: 0, toStateSeq: 1, sourceEpoch: 'source-epoch'
  });
  expect(await fs.readFile(outputPath)).toEqual(database);
  const broken = await fs.readFile(archivePath);
  const damageAt = broken.indexOf(compressed.subarray(0, 12)) + 20;
  if (damageAt < 20 || damageAt >= broken.length) throw new Error('compressed entry missing');
  broken[damageAt] = broken[damageAt]! ^ 1;
  await fs.writeFile(archivePath, broken);
  await fs.rm(outputPath);
  await expect(extractSyncPackDatabaseFromFile(args)).rejects.toThrow();
  await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
});
