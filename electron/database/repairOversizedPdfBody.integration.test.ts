// @vitest-environment node
import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { buildPdfReaderPlaceholder } from '../../lib/core/import/pdfReaderPlaceholder.js';
import { exportPdfTextArtifact, importPdfTextArtifact } from '../../lib/core/sync/pdfTextArtifact.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { repairOversizedPdfBody } from './repairOversizedPdfBody.js';
import { requestNodeRound, restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const nodeId = 'pdf-node';
const pdfHash = 'a'.repeat(64);
const pdfKey = `${pdfHash}.pdf`;
const pages = ['First page 中文. '.repeat(80_000).trim(), 'Last page.'];
const body = `# Paper\n\n${pages.join('\n\n')}`;
const placeholder = buildPdfReaderPlaceholder('Paper.pdf');
const time = '2026-11-13T00:00:00.000Z';
const input = { nodeId, pdfHash, expectedBodyHash: hashTextBody(body),
  expectedPageCount: pages.length, hostName: 'source', now: time };
const references = JSON.stringify([{ storage_key: pdfKey, role: 'reference', original_name: 'Paper.pdf' }]);

async function fixture() {
  const scope = await restoreFixture();
  const source = scope.peer('source');
  const driver = createBetterSqlite3Driver(source.sqlite);
  source.sqlite.prepare(`INSERT INTO nodes (id,kind,title,content,body_blob_hash,resource_references,
    import_source_fingerprint,created_at,updated_at,sync_dirty) VALUES (?,'topic','Paper',?,?,?,'pdf-source',?,?,1)`)
    .run(nodeId, body, input.expectedBodyHash, references, time, time);
  source.sqlite.prepare(`INSERT INTO import_sources
    (source_fingerprint,provider,source_kind,source_name,source_locator,first_imported_at,
      last_imported_at,last_content_fingerprint,latest_node_id)
    VALUES ('pdf-source','desktop_text_file','pdf','Paper.pdf','fixture',?,?,'pdf-content',?)`)
    .run(time, time, nodeId);
  source.sqlite.prepare("INSERT INTO pdf_index_state(attachment_id,status,version) VALUES (?,'ready',1)").run(pdfHash);
  for (const [index, text] of pages.entries()) source.sqlite.prepare('INSERT INTO pdf_page_text VALUES (?,?,?,600,800)')
    .run(pdfHash, index + 1, text);
  const previous = flushNodeSyncVersionWithDriver(driver, nodeId, 'source', time)!;
  return { scope, source, driver, previous };
}

it('resumes an existing peer from the rejected legacy PDF and preserves the complete paginated text', async () => {
  const { scope, source, driver, previous } = await fixture();
  try {
    const target = await scope.companionPeer('target');
    const errors: string[] = [];
    await requestNodeRound(source, target, errors);
    expect(errors.join(' ')).toMatch(/oversized|identity_mismatch|too_large/);
    expect(target.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get(nodeId)).toBeUndefined();

    const next = repairOversizedPdfBody(driver, input);
    expect(next).toBeTruthy();
    expect(repairOversizedPdfBody(driver, input)).toBeNull();
    const retryErrors: string[] = [];
    await requestNodeRound(source, target, retryErrors);
    expect(retryErrors).toEqual([]);

    const artifact = await exportPdfTextArtifact(source.db, pdfHash, 1);
    expect(artifact).toBeTruthy();
    await importPdfTextArtifact(target.db, pdfKey, artifact!.storageKey, artifact!.text);
    target.reopen();
    expect(target.sqlite.prepare('SELECT content, resource_references FROM nodes WHERE id = ?').get(nodeId))
      .toEqual({ content: placeholder, resource_references: references });
    const received = target.sqlite.prepare('SELECT text FROM pdf_page_text WHERE attachment_id = ? ORDER BY page')
      .pluck().all(pdfHash).join('\n\n');
    expect(hashTextBody(`# Paper\n\n${received}`)).toBe(input.expectedBodyHash);
    expect(target.sqlite.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?')
      .pluck().get(next)).toBe(previous);
  } finally { await scope.close(); }
});

it.each(['missing page', 'protected edit', 'publish failure'])('leaves the legacy PDF intact on %s', async scenario => {
  const { scope, source, driver, previous } = await fixture();
  try {
    if (scenario === 'missing page') source.sqlite.exec('DELETE FROM pdf_page_text WHERE page = 2');
    if (scenario === 'protected edit') source.sqlite.prepare(
      'INSERT INTO node_version_local_holds (hold_id,object_id,version_id,created_at) VALUES (?,?,?,?)')
      .run('editor_history_body:test', nodeId, previous, time);
    if (scenario === 'publish failure') source.sqlite.exec(`CREATE TRIGGER stop_pdf_repair BEFORE INSERT ON node_sync_versions
      BEGIN SELECT RAISE(ABORT, 'test_publish_failure'); END`);
    expect(() => repairOversizedPdfBody(driver, input)).toThrow(
      scenario === 'missing page' ? 'pdf_body_repair_pages_do_not_match' :
        scenario === 'protected edit' ? 'pdf_body_repair_has_protected_history' : 'test_publish_failure');
    const row = source.sqlite.prepare('SELECT content,current_version_id FROM nodes WHERE id = ?').get(nodeId) as
      { content: string; current_version_id: string };
    expect(hashTextBody(row.content)).toBe(input.expectedBodyHash);
    expect(row.current_version_id).toBe(previous);
  } finally { await scope.close(); }
});
