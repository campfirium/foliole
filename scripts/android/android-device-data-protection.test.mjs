// @vitest-environment node
/* global Buffer, URL */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { backupDatabase } from './android-data-backup-files.mjs';
import {
  assertProtectionPreserved, inspectProtectionIdentity
} from './android-device-data-protection.mjs';
import { assertReadableDatabase } from './android-data-protection-validation.mjs';
import { pullAttachmentArchive, pullDatabaseFile } from './android-device-snapshot.mjs';

describe('Android device data protection', () => {
  it('streams the companion database together with any live SQLite sidecars', async () => {
    const source = await readFile(new URL('./android-device-snapshot.mjs', import.meta.url), 'utf8');
    const entrySource = await readFile(
      new URL('./android-device-data-protection.mjs', import.meta.url), 'utf8'
    );
    const existenceCheck = source.indexOf("'test', '-f', remotePath");
    const databaseRead = source.indexOf("'cat', remotePath");

    expect(existenceCheck).toBeGreaterThan(-1);
    expect(databaseRead).toBeGreaterThan(existenceCheck);
    expect(source).toContain("const remoteBase = 'databases/foliole-companionSQLite.db'");
    expect(source).toContain("for (const suffix of ['-wal', '-shm'])");
    expect(source).toContain('sidecarPaths.push(sidecarPath)');
    expect(source).toContain('sidecarPaths, size');
    expect(entrySource).toContain('pathToFileURL(path.resolve(process.argv[1])).href');
  });

  it('keeps SQLite sidecars adjacent to the protected database copy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-protection-contract-'));
    const source = path.join(root, 'source.db');
    try {
      await Promise.all([
        writeFile(source, 'main'), writeFile(`${source}-wal`, 'wal'), writeFile(`${source}-shm`, 'shm')
      ]);
      const attachmentArchive = `${source}.attachments.tar`;
      await writeFile(attachmentArchive, 'attachments');
      const backup = await backupDatabase(
        { appId: 'com.foliole.android', backupRoot: path.join(root, 'backup') },
        { attachments: { path: attachmentArchive,
          sha256: '3930e671c9e40dee2a33442c6f1055e8e8b75958ee19da8bd470754fd44beec2' },
        database: { counts: { nodes: 2 }, exists: true, path: source,
          sidecarPaths: [`${source}-wal`, `${source}-shm`], size: 4 }, serial: 'fixed-a5' }
      );

      expect(await readFile(backup.databasePath, 'utf8')).toBe('main');
      expect(backup.sidecarPaths).toEqual([`${backup.databasePath}-wal`, `${backup.databasePath}-shm`]);
      expect(await Promise.all(backup.sidecarPaths.map((file) => readFile(file, 'utf8'))))
        .toEqual(['wal', 'shm']);
      expect(await readFile(backup.attachmentArchivePath, 'utf8')).toBe('attachments');
      expect(backup).toMatchObject({ validated: true,
        fileDigests: { attachments: expect.stringMatching(/^[0-9a-f]{64}$/u),
          database: expect.stringMatching(/^[0-9a-f]{64}$/u) } });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('ignores only absent sidecars and fails closed on transfer errors', async () => {
    const absent = Object.assign(new Error('missing'), { code: 1 });
    const failed = Object.assign(new Error('transport failed'), { code: 2 });
    await expect(pullDatabaseFile(
      { appId: 'com.foliole.android' }, 'database-wal', 'unused', async () => { throw absent; }
    )).resolves.toBe(false);
    await expect(pullDatabaseFile(
      { appId: 'com.foliole.android' }, 'database-wal', 'unused', async () => { throw failed; }
    )).rejects.toThrow('transport failed');
  });

  it('streams the stopped app attachment directory into a hashed restorable archive', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-attachment-protection-'));
    const destination = path.join(root, 'attachments.tar');
    const executeAdb = async (_options, args) => args.includes('tar')
      ? { stdout: Buffer.from('archive-bytes') }
      : { stdout: Buffer.alloc(0) };
    const archive = await pullAttachmentArchive(
      { appId: 'com.foliole.android' }, destination, executeAdb
    );
    expect(archive).toMatchObject({ size: 13, path: destination,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    expect(await readFile(destination, 'utf8')).toBe('archive-bytes');
    await rm(root, { force: true, recursive: true });
  });

  it('fails closed when a protection snapshot cannot prove a readable database', () => {
    expect(() => assertReadableDatabase({ database: { exists: false } }, 'before install')).toThrow('database is missing');
    expect(() => assertReadableDatabase({ database: { error: 'bad db', exists: true, unreadable: true } }, 'after install')).toThrow('database is unreadable');
    expect(() => assertReadableDatabase({ error: 'adb unavailable' }, 'before install')).toThrow('snapshot failed');
    expect(() => assertReadableDatabase({ database: { exists: true } }, 'after install')).not.toThrow();
  });

  it('reads protection identity from the current single-principal schema', () => {
    const database = {
      prepare: (sql) => ({
        get: () => sql.includes('sqlite_master') ? { exists: 1 } : {
          group_id: 'group-1', local_device_identity_key: 'device-1'
        }
      })
    };
    expect(inspectProtectionIdentity(database)).toEqual({
      activeSyncGroupId: 'group-1', localDeviceIdentityKey: 'device-1'
    });
  });

  it('fails closed when install changes identity, group, integrity, or data counts', () => {
    const snapshot = { database: { counts: { nodes: 2 }, inspection: {
      activeSyncGroupId: 'group-1', localDeviceIdentityKey: 'device-1'
    }, integrity: 'ok' } };
    expect(() => assertProtectionPreserved(snapshot, JSON.parse(JSON.stringify(snapshot)))).not.toThrow();
    const changed = JSON.parse(JSON.stringify(snapshot));
    changed.database.inspection.localDeviceIdentityKey = 'device-2';
    expect(() => assertProtectionPreserved(snapshot, changed))
      .toThrow('database identity, group, or counts changed');
  });
});
