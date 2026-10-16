// @vitest-environment node
import { expect, it } from 'vitest';

import { migratePdfTextArtifacts } from '../../lib/core/database/pdfTextArtifactMigration.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { exportPdfTextArtifact, importPdfTextArtifact } from '../../lib/core/sync/pdfTextArtifact.js';

import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const pdf = 'a'.repeat(64), other = 'b'.repeat(64);
function artifact(hash: string, count: number) {
  const text = JSON.stringify({ pdf: hash, version: 1, pages: Array.from({ length: count }, (_, index) => ({
    page: index + 1, text: `Page ${index + 1} 中文`, page_width: 600, page_height: 800
  })) });
  return { text, key: `${hashTextBody(text)}.pdftext` };
}
it('replaces a complete PDF text artifact atomically and preserves another PDF across replay and reopen', async () => {
  const fixture = await restoreFixture(); const target = fixture.peer('target');
  const install = (hash: string, count: number) => {
    const value = artifact(hash, count);
    return importPdfTextArtifact(target.db, `${hash}.pdf`, value.key, value.text);
  };
  try {
    await install(pdf, 3); await install(other, 2);
    target.sqlite.exec("CREATE TRIGGER fail_text BEFORE INSERT ON pdf_page_text BEGIN SELECT RAISE(ABORT, 'disk_failure'); END");
    await expect(install(pdf, 1)).rejects.toThrow('disk_failure');
    expect(target.sqlite.prepare('SELECT COUNT(*) count FROM pdf_page_text').get()).toEqual({ count: 5 });
    target.sqlite.exec('DROP TRIGGER fail_text');
    for (let replay = 0; replay < 2; replay++) {
      await install(pdf, 1); target.reopen();
      expect(target.sqlite.prepare('SELECT attachment_id, COUNT(*) count FROM pdf_page_text GROUP BY attachment_id ORDER BY attachment_id').all())
        .toEqual([{ attachment_id: pdf, count: 1 }, { attachment_id: other, count: 2 }]);
    }
    const value = artifact(pdf, 1);
    await expect(importPdfTextArtifact(target.db, `${other}.pdf`, value.key, value.text)).rejects.toThrow('pdf_text_artifact_invalid');
    await expect(importPdfTextArtifact(target.db, `${pdf}.pdf`, value.key, value.text.replace('中文', 'tampered')))
      .rejects.toThrow('pdf_text_artifact_invalid');
  } finally { await fixture.close(); }
});
it('retains local PDF text on migration and exports only a completed supported extractor version', async () => {
  const fixture = await restoreFixture(); const peer = fixture.peer('source');
  try {
    await peer.db.run('INSERT INTO pdf_page_text VALUES (?, 1, ?, 600, 800)', [pdf, 'Retained']);
    await peer.db.run(`INSERT INTO sync_object_state(object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
      VALUES ('pdf_page_text', ?, 1, ?, 'fixture', 'now')`, [`${pdf}:1`, 'a'.repeat(64)]);
    migratePdfTextArtifacts(peer.sqlite);
    expect(peer.sqlite.prepare('SELECT text FROM pdf_page_text').get()).toEqual({ text: 'Retained' });
    expect(peer.sqlite.prepare("SELECT COUNT(*) count FROM sync_object_state WHERE object_type = 'pdf_page_text'").get()).toEqual({ count: 0 });
    expect(await exportPdfTextArtifact(peer.db, pdf, 1)).toBeNull();
    await peer.db.run("INSERT INTO pdf_index_state(attachment_id, status, version) VALUES (?, 'ready', 1)", [pdf]);
    expect(await exportPdfTextArtifact(peer.db, pdf, 2)).toBeNull();
    expect(await exportPdfTextArtifact(peer.db, pdf, 1)).toMatchObject({ storageKey: expect.stringMatching(/^[a-f0-9]{64}\.pdftext$/u) });
  } finally { await fixture.close(); }
});
