// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { requestSyncObjectMessages } from '../../lib/core/sync/requestSyncObjectMessages.js';
import { receiveRequestSyncObjectMessages } from '../../lib/core/sync/requestSyncObjectReceiver.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
let root = '';
afterEach(async () => {
  for (const host of devices.splice(0)) host.sqlite.close();
  if (root) await rm(root, { recursive: true });
});

it('spools a complete history with retired middle bodies and applies it without publication state', async () => {

  const source = textDevice(); const target = textDevice(); devices.push(source, target);
  const base = textBranch('base', 'Original');
  const middle = textBranch('middle', 'Intermediate', base);
  const head = textBranch('head', '中😀'.repeat(120_000), middle);
  await source.receive([base, middle, head]);
  await source.db.run(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_deleted', json('true'))
    WHERE version_id = 'middle'`);
  const entry = await readFramedSyncInventoryEntry(source.db, { objectType: 'node', globalId: 'topic' });
  if (!entry) throw new Error('test_inventory_missing');
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  if (!difference) throw new Error('test_difference_missing');
  await mkdir('.tmp/artifacts', { recursive: true });
  root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-files-'));
  const files = createDesktopFramedSyncFiles(root);
  const remove = files.remove.bind(files);
  files.remove = key => remove(key);

  await withRequestSyncFiles(files, async request => {

    await writeRequestSyncSnapshot(source.db, difference, request);
    const facts = [];
    for await (const fact of request.readFacts()) facts.push(fact);
    expect(facts.filter(fact => fact.kind === 2).map(fact => fact.factId).sort()).toEqual(['base', 'head', 'middle']);
    for (const fact of facts.filter(fact => fact.kind === 2)) {
      expect(fact.body.find(field => field.name === 'ancestor_version_ids')).toBeUndefined();
    }
    await withRequestSyncFiles(files, async received => {

      const header = { requestId: new Uint8Array(16).fill(1), objectType: 'node', globalId: 'topic',
        sourceStateHash: entry.sharedStateHash };
      const context: RequestSyncAuthenticatedContext = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
        initiatorDeviceId: 'source', initiatorLibraryEpoch: 'source-epoch',
        responderDeviceId: 'target', responderLibraryEpoch: 'target-epoch' };
      const groupKey = new Uint8Array(32).fill(7);
      const wire = await prepareRequestSyncWire({ context, groupKey,
        messages: contextId => requestSyncObjectMessages(header, contextId, request) });
      const decoded = readRequestSyncWire({ context, groupKey,
        preamble: wire.preamble, frames: wire.frames });
      expect(await receiveRequestSyncObjectMessages(decoded, wire.contextId, received)).toEqual(header);
      await applyFramedFactSources(target.db, [async function* () { yield* received.readFacts(); }], {
        requireCompleteVersionGraph: true, loadBody: (_db, blob) => received.loadBody(blob)
      });
    });
    expect((await target.current()).body_text).toBe(head.body_text);
    expect(await target.db.query('SELECT version_id, parent_version_id FROM node_sync_versions ORDER BY version_id'))
      .toEqual(await source.db.query('SELECT version_id, parent_version_id FROM node_sync_versions ORDER BY version_id'));
    expect(await target.db.query("SELECT body_text FROM node_sync_versions WHERE version_id = 'middle'"))
      .toEqual([{ body_text: null }]);
  });
  expect((await readdir(root)).filter(name => name !== 'requests')).toEqual([]);
  expect(await files.list('requests')).toEqual([]);
});

it('cleans request files when preparation is cancelled', async () => {
  await mkdir('.tmp/artifacts', { recursive: true });
  root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-cancel-'));
  const files = createDesktopFramedSyncFiles(root);
  const controller = new AbortController();
  await expect(withRequestSyncFiles(files, async request => {
    await files.write(`${request.directory}/owned`, new Uint8Array([1]));
    controller.abort(new Error('request_cancelled'));
    await request.readFacts()[Symbol.asyncIterator]().next();
    controller.signal.throwIfAborted();
  }, controller.signal)).rejects.toThrow('request_cancelled');
  expect((await readdir(root)).filter(name => name !== 'requests')).toEqual([]);
  expect(await files.list('requests')).toEqual([]);
});
