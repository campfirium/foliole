// @vitest-environment node
import './pdfIndexingTestSupport.js';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { persistNodeResourceReference } from './nodeResources.js';
import { searchCurrentPdfDocument } from './pdfDocumentSearch.js';
import { enqueuePdfAttachmentIndexing } from './pdfIndexing.js';
import { pdfId, seedPdfTopic, status, tasks } from './pdfIndexingTestSupport.js';
import { installSqlScaleProbe } from './sqlScaleProbe.testSupport.js';
import { findLoopFullScans } from './sqlScanPlan.testSupport.js';

it('indexes both owners of a PDF without scanning the library for its references', async () => {
  seedPdfTopic('shared-topic', false);
  persistNodeResourceReference('shared-topic', {
    storage_key: `${pdfId}.pdf`, role: 'reference', original_name: 'Shared.pdf'
  });

  const probe = installSqlScaleProbe('index PDF');
  try {
    enqueuePdfAttachmentIndexing(pdfId);
    await tasks[0];
    const executions = [...probe.records.values()].flatMap(step => [...step.values()]);
    const scans = executions.flatMap(findLoopFullScans).filter(finding => finding.table === 'nodes');
    expect(status()).toMatchObject({ status: 'ready' });
    for (const id of ['pdf-topic', 'shared-topic']) {
      expect(searchCurrentPdfDocument(id, 'gamma keyword')).toMatchObject({ matches: [{ page: 3 }], status: 'ready' });
    }
    expect(scans.map(finding => finding.sql)).toEqual([]);
  } finally {
    probe.uninstall();
  }
});

it('backfills existing PDF mounts when upgrading a library', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.exec(`DROP TRIGGER pdf_attachment_nodes_insert; DROP TRIGGER pdf_attachment_nodes_update;
      DROP TABLE pdf_attachment_nodes; PRAGMA user_version = 197`);
    const storageKey = `${pdfId}.pdf`;
    const references = JSON.stringify([{ storage_key: storageKey, original_name: 'Legacy.pdf', role: 'reference' }]);
    sqlite.prepare(`INSERT INTO nodes (id, title, resource_references, created_at, updated_at, deleted_at)
      VALUES ('legacy', 'Legacy', ?, 'now', 'now', 'now')`).run(references);

    initializeDatabaseSchema(sqlite);

    expect(sqlite.prepare('SELECT storage_key, node_id FROM pdf_attachment_nodes').all())
      .toEqual([{ storage_key: storageKey, node_id: 'legacy' }]);
  } finally {
    sqlite.close();
  }
});
