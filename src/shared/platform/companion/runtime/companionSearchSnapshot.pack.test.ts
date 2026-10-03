// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { PACK_SCHEMA } from '../../../../../lib/core/sync/syncPackSchema';
import { searchCompanionFullTextSnapshot } from '../../companionFullTextSearch';
import { applyCompanionSyncPackNodesWithDbPort } from '../../companionSyncPackNodes';

import { createSearchLibrary } from './companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({})
}));

function createPack(root: string, seq: number) {
  const file = path.join(root, `pack-${seq}.db`);
  const pack = new Database(file);
  pack.exec(PACK_SCHEMA.join(';'));
  pack.prepare('INSERT INTO pack_manifest VALUES (?,?)').run('manifest_json', JSON.stringify({
    from_state_seq: seq - 1, to_state_seq: seq, frontier_state_seq: 2, source_epoch: 'search-test'
  }));
  pack.prepare(`INSERT INTO external_documents
    (document_id,folder_id,relative_path,file_name,extension,source_size_bytes,source_modified_at,
     source_modified_ms,content_hash,title,content,indexed_at,created_at,updated_at)
    VALUES ('000000','folder','a.md','a.md','md',0,'now',0,?,'Updated',?,'now','now',?)`)
    .run(`hash-${seq}`, `alpha pack ${seq}`, `2026-10-03T0${seq}:00:00Z`);
  pack.prepare('INSERT INTO sync_object_state VALUES (?,?,?,?,?,?,NULL)')
    .run('external_document', '000000', seq, `hash-${seq}`, 'source', `2026-10-03T0${seq}:00:00Z`);
  pack.close();
  return file;
}

it('keeps the search snapshot when one real sync pack commits and the next pack fails', async () => {
  const library = await createSearchLibrary();
  try {
    library.database.exec("INSERT INTO sync_groups VALUES ('group','Group','key','now','now')");
    library.database.exec("INSERT INTO sync_group_local_state VALUES (1,'group','receiver','active','now')");
    const before = await searchCompanionFullTextSnapshot('alpha');
    const original = JSON.stringify(before);
    const apply = (seq: number) => writeIosCompanionDatabase((db) => applyCompanionSyncPackNodesWithDbPort({
      currentCursor: seq - 1, deviceId: 'receiver', hostName: 'Search', sourcePeerId: 'source',
      packPath: createPack(library.root, seq)
    }, db));
    await apply(1);
    library.database.exec("CREATE TRIGGER fail_pack BEFORE INSERT ON external_documents BEGIN SELECT RAISE(ABORT,'later pack failure'); END");
    await expect(apply(2)).rejects.toThrow('later pack failure');
    expect(JSON.stringify(before)).toBe(original);
    const latest = await searchCompanionFullTextSnapshot('alpha');
    expect(latest.external.find((row) => row.document_id === '000000')?.excerpt).toContain('alpha pack 1');
    expect(latest.external.find((row) => row.document_id === '000000')?.content).toBe('');
    expect(library.database.prepare("SELECT content FROM external_documents WHERE document_id='000000'").get())
      .toEqual({ content: 'alpha pack 1' });
  } finally { await library.close(); }
});
