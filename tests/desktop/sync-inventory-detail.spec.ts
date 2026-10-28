import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('publishes requested sync details and keeps the saved article readable after reload', async ({ desktopSession, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const nodeId = 'inventory-detail-target';
  const content = 'Requested sync detail retains this complete saved body. 中😀';
  await desktopWindow.evaluate(async ({ id, body }) => {
    await window.__folioleWorkspaceDebug?.seedNodes([
      { id, content: body, kind: 'topic', title: 'Inventory detail target' },
      ...Array.from({ length: 30 }, (_, index) => ({ id: `detail-unrelated-${index}`,
        content: `Other body ${index}`, kind: 'topic' as const, title: `Other ${index}` }))
    ], { persist: true });
  }, { id: nodeId, body: content });
  const details = await desktopSession.electronApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const { createDesktopRequestSyncDatabaseHost } = require(`${process.cwd()}/dist/electron/sync/desktopRequestSyncDatabaseHost.js`);
    const { respondRequestSyncDatabase } = require(`${process.cwd()}/dist/lib/core/sync/requestSyncDatabaseResponse.js`);
    const { prepareRequestSyncWire, readRequestSyncWire } = require(`${process.cwd()}/dist/lib/core/sync/requestSyncWire.js`);
    const { iterateRequestSyncInventory, decodeRequestSyncInventory } = require(`${process.cwd()}/dist/lib/core/sync/requestSyncInventoryWire.js`);
    const { FRAMED_SYNC_PROTOCOL_VERSION } = require(`${process.cwd()}/dist/lib/core/sync/framedSyncContract.js`);
    const dbPath = await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().dbPath);
    if (!dbPath.includes('foliole-playwright')) throw new Error('Expected an isolated test library');
    const auth = { context: { groupId: 'detail-test', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: 'local', initiatorLibraryEpoch: 'local-epoch',
      responderDeviceId: 'peer', responderLibraryEpoch: 'peer-epoch' }, groupKey: new Uint8Array(32).fill(7) };
    const request = await prepareRequestSyncWire({ ...auth, messages: async function* () {
      yield* iterateRequestSyncInventory({ entries: [], roundId: new Uint8Array(16).fill(1), detailGlobalIds: [id, 'absent'] });
    } });
    try {
      const result = await respondRequestSyncDatabase(createDesktopRequestSyncDatabaseHost(dbPath),
        { ...auth, stream: request, mode: 'inventory' }, async (response: object) =>
          decodeRequestSyncInventory((async function* () {
            for await (const decoded of readRequestSyncWire({ ...auth, ...response })) yield decoded.message;
          })()));
      return result.entries.map((entry: { globalId: string; currentVersionId: string; frontierFactIds: string[]; unready: boolean }) => ({
        globalId: entry.globalId, currentVersionId: entry.currentVersionId,
        frontierFactIds: entry.frontierFactIds, unready: entry.unready
      }));
    } finally { await request.frames.return(undefined); }
  }, nodeId);
  expect(details).toEqual([{ globalId: nodeId, currentVersionId: expect.any(String),
    frontierFactIds: [expect.any(String)], unready: false }]);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(id => window.__folioleWorkspaceDebug?.openNode(id), nodeId);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(content);
});
