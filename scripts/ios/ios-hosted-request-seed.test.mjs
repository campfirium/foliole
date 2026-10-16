import { exportPdfTextArtifact, importPdfTextArtifact } from '../../lib/core/sync/pdfTextArtifact.ts';
// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TextEncoder } from 'node:util';

import { afterEach, expect, it } from 'vitest';

import { textDevice } from '../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { hostedAttachments, hostedContentBodies, hostedLegalVersion } from './ios-hosted-request-seed-data.ts';
import { seedIosHostedRequestLibrary } from './ios-hosted-request-seed.ts';

const devices = [];
const roots = [];
afterEach(() => {
  for (const host of devices.splice(0)) host.sqlite.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function pair() {
  const source = textDevice(), target = textDevice();
  devices.push(source, target);
  mkdirSync('.tmp/artifacts', { recursive: true });
  const root = mkdtempSync(path.resolve('.tmp/artifacts/hosted-request-seed-')); roots.push(root);
  return { source, target, files: createDesktopFramedSyncFiles(root) };
}
async function transfer(context, objectType, globalId) {
  const entry = await readFramedSyncInventoryEntry(context.source.db, { objectType, globalId });
  expect(entry).not.toBeNull();
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  await withRequestSyncFiles(context.files, async request => {
    await writeRequestSyncSnapshot(context.source.db, difference, request);
    await applyFramedFactSources(context.target.db, [async function* () { yield* request.readFacts(); }], {
      requireCompleteVersionGraph: true, loadBody: (_db, blob) => request.loadBody(blob)
    });
  });
}
it('creates current synthetic versions and transfers complete topic, external and PDF text with its reference', async () => {
  const context = pair();
  await seedIosHostedRequestLibrary(context.source.db, 'contentResource');
  for (const name of ['topic', 'missing', 'corrupt']) {
    await transfer(context, 'node', `ios-content-${name}`);
    expect(context.target.sqlite.prepare('SELECT content FROM nodes WHERE id=?').get(`ios-content-${name}`).content)
      .toBe(hostedContentBodies[name].text);
  }
  await transfer(context, 'external_document', 'ios-external:orchid.md');
  const artifact = await exportPdfTextArtifact(context.source.db, hostedAttachments.valid.hash, 1);
  await importPdfTextArtifact(context.target.db, `${hostedAttachments.valid.hash}.pdf`, artifact.storageKey, artifact.text);
  expect(context.target.sqlite.prepare('SELECT content FROM external_documents').get().content)
    .toBe(hostedContentBodies.external.text);
  expect(context.target.sqlite.prepare('SELECT text FROM pdf_page_text').get().text).toBe('Extracted pdf-cobalt-token');
  const references = JSON.parse(context.target.sqlite.prepare("SELECT resource_references FROM nodes WHERE id='ios-content-topic'").get().resource_references);
  expect(references).toHaveLength(4);
  expect(references).toEqual(expect.arrayContaining(Object.entries(hostedAttachments).map(([name, resource]) => ({
    storage_key: `${resource.hash}.${name === 'valid' ? 'pdf' : 'png'}`, role: 'reference',
    original_name: `ios-acceptance-${name}-attachment.bin`
  }))));
});
it('creates the formerly unversioned state fixture and transfers its initial fact', async () => {
  const context = pair();
  await seedIosHostedRequestLibrary(context.source.db, 'stateInitial');
  await transfer(context, 'node', 'ios-state-node');
  expect(context.target.sqlite.prepare('SELECT title,content,current_version_id FROM nodes').get()).toEqual({
    title: 'State acceptance', content: '', current_version_id: 'ver_hosted_ios-state-node'
  });
});
it('preserves legal source history and all metadata through the current snapshot representation', async () => {
  const context = pair();
  await seedIosHostedRequestLibrary(context.source.db, 'legal');
  const original = context.source.sqlite.prepare('SELECT * FROM node_sync_versions').get();
  expect(original).toEqual(hostedLegalVersion);
  context.target.sqlite.prepare(`INSERT INTO nodes(id,kind,title,content,created_at,updated_at)
    VALUES ('special-inbox','folder','Inbox','','2026-07-21','2026-07-21')`).run();
  await transfer(context, 'node', original.object_id);
  const received = context.target.sqlite.prepare('SELECT * FROM node_sync_versions').get();
  expect(received).toMatchObject({ ...hostedLegalVersion, snapshot_json: expect.any(String) });
  expect(received.snapshot_json).not.toBe(original.snapshot_json);
  expect(JSON.parse(received.snapshot_json)).toEqual({ ...JSON.parse(original.snapshot_json), content: null, image_sources: null,
    body_blob_hash: '1848a822cbf8e11f7146e851d50e44606a2b618631cf468c4ec31a8968f474d3' });
  expect(context.target.sqlite.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual([]);
});
it.each(['missing', 'corrupt'])('allows a %s body fault after normal seeding without committing incomplete nodes', async fault => {
  const context = pair();
  await seedIosHostedRequestLibrary(context.source.db, 'contentResource');
  const entry = await readFramedSyncInventoryEntry(context.source.db, { objectType: 'node', globalId: `ios-content-${fault}` });
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  await withRequestSyncFiles(context.files, async request => {
    await writeRequestSyncSnapshot(context.source.db, difference, request);
    await expect(applyFramedFactSources(context.target.db, [async function* () { yield* request.readFacts(); }], {
      requireCompleteVersionGraph: true, loadBody: async () => {
        if (fault === 'missing') throw new Error('fixture_body_missing');
        return new TextEncoder().encode('corrupt replacement');
      }
    })).rejects.toThrow();
  });
  expect(context.target.sqlite.prepare('SELECT id FROM nodes').all()).toEqual([]);
  expect(context.target.sqlite.prepare('SELECT version_id FROM node_sync_versions').all()).toEqual([]);
});
