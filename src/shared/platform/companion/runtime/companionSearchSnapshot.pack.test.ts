// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../../../../../electron/database/syncLibrary.testSupport';
import { withLibraryRequestSnapshot } from '../../../../../electron/database/syncRequestSnapshot.testSupport';
import { computeSyncContentHash } from '../../../../../lib/core/database/syncState';
import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';
import { buildCanonicalExternalDocumentPayload } from '../../../../../lib/core/sync/canonicalExternalResourcePayload';
import { searchCompanionFullTextSnapshot } from '../../companionFullTextSearch';

import { createSearchLibrary } from './companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub };
});

function updateSource(source: Peer, seq: number) {
  const pack = source.db;
  const document = buildCanonicalExternalDocumentPayload({
    body_blob_hash: hashTextBody(`alpha pack ${seq}`),
    content_hash: `hash-${seq}`,
    document_id: '000000',
    extension: 'md',
    file_name: 'a.md',
    folder_id: 'folder',
    reference_json: null,
    reference_kind: 'local_path',
    relative_path: 'a.md',
    title: 'Updated'
  });
  pack.prepare(`INSERT OR REPLACE INTO external_documents
    (document_id,folder_id,relative_path,file_name,extension,source_size_bytes,source_modified_at,
     source_modified_ms,content_hash,title,content,indexed_at,created_at,updated_at)
    VALUES ('000000','folder','a.md','a.md','md',0,'now',0,?,'Updated',?,'now','now',?)`)
    .run(`hash-${seq}`, `alpha pack ${seq}`, `2026-10-03T0${seq}:00:00Z`);
  pack.prepare('UPDATE external_documents SET body_blob_hash = ? WHERE document_id = ?')
    .run(document.body_blob_hash, '000000');
  pack.prepare(`INSERT OR REPLACE INTO sync_object_state
    (object_type,object_id,state_seq,content_hash,last_modified_by_host_name,updated_at,sync_dirty) VALUES (?,?,?,?,?,?,1)`)
    .run('external_document', '000000', seq,
      computeSyncContentHash('external_document', document), 'source', `2026-10-03T0${seq}:00:00Z`);
}

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let source: Peer;
let target: Peer;
beforeEach(async () => {
  await startLibraries();
  library = await createSearchLibrary();
  source = createPeer('source');
  target = { ...source, id: 'receiver', name: 'Search', db: library.database,
    port: createBetterSqliteDbPort(library.database) };
  joinPeers(source, target);
});
afterEach(async () => { await library?.close(); await closeLibraries(); });

it('keeps the search snapshot when one real request commits and the next request fails', { meta: { calibratedMs: 30000 } }, async () => {
  const before = await searchCompanionFullTextSnapshot('alpha');
  const original = JSON.stringify(before);
  const apply = (seq: number) => {
    updateSource(source, seq);
    return writeIosCompanionDatabase(db => withLibraryRequestSnapshot(source,
      { ...target, port: db }, async replay => { await replay(); }));
  };
  await apply(1);
  library.database.exec("CREATE TRIGGER fail_pack BEFORE INSERT ON external_documents BEGIN SELECT RAISE(ABORT,'later pack failure'); END");
  await expect(apply(2)).rejects.toThrow('later pack failure');
  expect(JSON.stringify(before)).toBe(original);
  const latest = await searchCompanionFullTextSnapshot('alpha');
  expect(latest.external.find((row) => row.document_id === '000000')?.excerpt).toContain('alpha pack 1');
  expect(latest.external.find((row) => row.document_id === '000000')?.content).toBe('');
  expect(library.database.prepare("SELECT content FROM external_documents WHERE document_id='000000'").get())
    .toEqual({ content: 'alpha pack 1' });
});
