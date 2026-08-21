// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion.js';
import {
  SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION
} from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { writeStoredZip } from '../diagnostics/zipStore.js';

import { extractSyncPackDatabase } from './syncPackContainerReader.js';

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
    schema_version: DATABASE_SCHEMA_VERSION - 1,
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
    schema_version: DATABASE_SCHEMA_VERSION,
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
