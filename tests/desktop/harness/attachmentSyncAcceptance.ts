import type { DesktopSession } from './fixtures';
import { expect } from './fixtures';

export async function addSyncImage(session: DesktopSession, nodeId: string) {
  const bytesBase64 = await session.electronApp.evaluate(({ nativeImage }) => {
    const image = nativeImage.createFromPath(`${process.cwd()}/assets/brand/foliole-leaf-tight.png`);
    return image.resize({ width: 128, height: 80 }).toPNG().toString('base64');
  });
  const imported = await session.firstWindow.evaluate(({ nodeId, bytesBase64 }) =>
    window.electronAPI.invoke('import_clipboard_image_attachment', {
      nodeId, bytesBase64, mimeType: 'image/png', originalName: 'attachment-sync.png'
    }), { nodeId, bytesBase64 }) as { status: string; storage_key: string; attachment_id: string };
  expect(imported.status).toBe('imported');
  const key = `${imported.attachment_id}.png`;
  await session.firstWindow.locator('.prompt-editor-host .cm-content')
    .fill(`Attachment survives synchronization and restart.\n\n![Image](asset://${key})`);
  await expect.poll(() => session.electronApp.evaluate(({ app }, input) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const connection = require(`${app.getAppPath()}/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() =>
      connection.openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(input.nodeId));
  }, { nodeId })).toContain(`asset://${key}`);
  return key;
}

export async function expectSyncedImage(session: DesktopSession, key: string) {
  await expect.poll(() => session.electronApp.evaluate(({ app }, storageKey) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const fs = process.getBuiltinModule('fs')!;
    const path = process.getBuiltinModule('path')!;
    const crypto = process.getBuiltinModule('crypto')!;
    const paths = require(`${app.getAppPath()}/database/runtimeDataPaths.js`).resolveRuntimeDataPaths();
    const file = path.join(paths.assetsDir, storageKey);
    return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
  }, key), { timeout: 30_000 }).toBe(key.slice(0, 64));
}
