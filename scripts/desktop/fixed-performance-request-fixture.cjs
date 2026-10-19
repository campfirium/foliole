/* global process, crypto */
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

function defaultServices() {
  const built = name => require(path.join(process.cwd(), 'dist', name));
  return {
    initialize: built('lib/core/database/migrations.js').initializeDatabaseSchema,
    createDriver: built('electron/database/betterSqlite3Driver.js').createBetterSqlite3Driver,
    flush: built('electron/database/nodeSyncVersionFromDriver.js').flushNodeSyncVersionWithDriver,
    createPort: built('electron/database/betterSqliteDbPort.js').createBetterSqliteDbPort,
    inventory: built('lib/core/sync/framedSyncInventoryRead.js').readFramedSyncInventory,
    compare: built('lib/core/sync/framedSyncInventory.js').compareFramedSyncInventories,
    createFiles: built('electron/sync/desktopFramedSyncFiles.js').createDesktopFramedSyncFiles,
    batchSnapshot: built('lib/core/sync/requestSyncBatchSnapshot.js').withRequestSyncBatchSnapshot,
    batchMessages: built('lib/core/sync/requestSyncBatchSnapshot.js').requestSyncBatchMessages,
    prepareWire: built('lib/core/sync/requestSyncWire.js').prepareRequestSyncWire,
    receiveBatch: built('lib/core/sync/requestSyncBatchReceiver.js').receiveRequestSyncBatch,
    batchObjects: built('lib/core/sync/requestSyncBatchContract.js').REQUEST_SYNC_BATCH_OBJECTS,
    protocolVersion: built('lib/core/sync/framedSyncContract.js').FRAMED_SYNC_PROTOCOL_VERSION
  };
}

function seedSource(db, count, services) {
  const insert = db.prepare(`INSERT INTO nodes
    (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES (?, ?, 'topic', 'Benchmark', '', '2026-10-01', '2026-10-01')`);
  db.transaction(() => {
    for (let index = 0; index < count; index++) insert.run(`bench-${index}`,
      index === 0 ? null : `bench-${Math.floor((index - 1) / 20)}`);
    const driver = services.createDriver(db);
    for (let index = 0; index < count; index++) services.flush(driver, `bench-${index}`, 'Source', '2026-10-01T00:00:00Z');
  })();
}

function seedReceiver(db) {
  db.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'target', 'active', 'now');
    UPDATE node_version_local_proof_state SET library_epoch = 'target-epoch';
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now'),
      ('group', 'target', 'target-anchor', '/target', 'Target', 'mac', 'active', 'now', 'now')`);
}

const projectionSql = `SELECT n.id, n.parent_id, n.title, n.content, n.current_version_id,
  v.content_hash, v.body_text FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id ORDER BY n.id`;

async function receiveBatches(services, sender, receiver, differences, timings) {
  const context = { groupId: 'group', protocolVersion: services.protocolVersion,
    initiatorDeviceId: 'source', initiatorLibraryEpoch: 'source-epoch',
    responderDeviceId: 'target', responderLibraryEpoch: 'target-epoch' };
  const peerState = { contract_version: 3, group_id: 'group', sender_device_identity_key: 'source',
    library_epoch: 'source-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
  const groupKey = new Uint8Array(32).fill(7);
  for (let offset = 0; offset < differences.length;) {
    const batch = differences.slice(offset, offset + services.batchObjects);
    const selections = batch.map(difference => ({ objectType: 'node', globalId: difference.globalId,
      requestId: crypto.getRandomValues(new Uint8Array(16)), resolve: async () => difference }));
    const started = performance.now();
    let wireMs = 0;
    let receiveMs = 0;
    const consumed = await services.batchSnapshot(sender, selections, undefined, async objects => {
      assert.ok(objects.length > 0);
      assert.ok(objects.every(object => object.kind === 'object'));
      const requestId = crypto.getRandomValues(new Uint8Array(16));
      const wireStarted = performance.now();
      const wire = await services.prepareWire({ context, groupKey,
        messages: contextId => services.batchMessages(objects, contextId, requestId) });
      wireMs = performance.now() - wireStarted;
      const receiveStarted = performance.now();
      const result = await services.receiveBatch(receiver, { ...wire, context, groupKey, peerState,
        author: 'initiator', requestId, expected: selections.slice(0, objects.length) });
      receiveMs = performance.now() - receiveStarted;
      assert.equal(result.results.length, objects.length);
      assert.ok(result.results.every(value => value.error === ''));
      return objects.length;
    });
    timings.snapshotMs += performance.now() - started - wireMs - receiveMs;
    timings.wireMs += wireMs;
    timings.receiveMs += receiveMs;
    timings.batches++;
    offset += consumed;
  }
}

async function prepareRequestFixture(nodeCount, services = defaultServices()) {
  const Database = require('better-sqlite3');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-request-performance-'));
  const source = new Database(':memory:'); const db = new Database(':memory:');
  const close = async () => { source.close(); db.close(); await fs.rm(root, { recursive: true, force: true }); };
  try {
    services.initialize(source); services.initialize(db);
    seedSource(source, nodeCount, services); seedReceiver(db);
    const sourcePort = services.createPort(source); const port = services.createPort(db);
    const differences = services.compare({ local: await services.inventory(sourcePort), remote: [] });
    const nodes = new Map(differences.filter(value => value.objectType === 'node').map(value => [value.globalId, value]));
    const ordered = Array.from({ length: nodeCount }, (_, index) => {
      const difference = nodes.get(`bench-${index}`);
      assert.ok(difference, 'benchmark source must expose a real version inventory');
      return difference;
    });
    const expected = source.prepare(projectionSql).all();
    assert.equal(expected.length, nodeCount);
    const sender = { files: services.createFiles(path.join(root, 'source')),
      readSnapshot: read => sourcePort.transaction(read), write: write => write(sourcePort) };
    const receiver = { files: services.createFiles(path.join(root, 'target')),
      readSnapshot: read => port.transaction(read), write: write => write(port), enqueueSearchInvalidations: false };
    const timings = { snapshotMs: 0, wireMs: 0, receiveMs: 0, batches: 0 };
    return { db, timings, apply: () => receiveBatches(services, sender, receiver, ordered, timings), assertResult() {
      assert.deepEqual(db.prepare(projectionSql).all(), expected);
      assert.equal(db.prepare('SELECT count(*) FROM node_sync_versions').pluck().get(), nodeCount);
    }, close };
  } catch (error) { await close(); throw error; }
}

module.exports = { prepareRequestFixture };
