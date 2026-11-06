import type { DesktopSession } from './harness/fixtures';

export async function creationReceipt(session: DesktopSession, release = false) {
  return session.electronApp.evaluate((_, release) => {
    const state = Reflect.get(globalThis, 'creationReceipt');
    if (release) state.release();
    return { ready: state.ready, nodeId: state.nodeId };
  }, release) as Promise<{ ready: boolean; nodeId: string }>;
}

export async function creationFacts(session: DesktopSession, nodeId: string) {
  return session.electronApp.evaluate(async (_, nodeId) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const { sqlite, dbPath } = connection.openDatabaseConnection();
      if (!dbPath.includes('foliole-playwright')) throw new Error('isolated_library_required');
      const { createBetterSqliteDbPort } = require(`${process.cwd()}/dist/electron/database/betterSqliteDbPort.js`);
      const { hasContentEditingSession } = require(`${process.cwd()}/dist/lib/core/sync/contentEditingSession.js`);
      return { editing: hasContentEditingSession(createBetterSqliteDbPort(sqlite), nodeId),
        content: sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId) };
    });
  }, nodeId) as Promise<{ editing: boolean; content: string }>;
}

export async function delayCreationReceipt(session: DesktopSession) {
  await session.electronApp.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const commands = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const original = commands.handleInvokeRequest;
    const { IPC_INVOKE_CHANNEL: channel } = require(`${process.cwd()}/dist/electron/ipc/contracts.js`);
    const invoke = (event: Electron.IpcMainInvokeEvent, request: Parameters<typeof original>[0]) =>
      original(request, { sender: event.sender });
    const state = { ready: false, nodeId: '', release: () => undefined as void,
      restore: () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, invoke); } };
    const gate = new Promise<void>(resolve => { state.release = resolve; });
    Object.assign(globalThis, { creationReceipt: state });
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, request) => {
      const result = await invoke(event, request);
      if (request.command === 'create_topic') {
        state.nodeId = request.args.nodeId;
        state.ready = true;
        await gate;
      }
      return result;
    });
});
}
