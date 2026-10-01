import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('queued one-time migration makes a historical image readable and does not repeat', async ({ desktopApp, desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  await expect.poll(() => desktopApp.evaluate(() => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { openDatabaseConnection } = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return openDatabaseConnection().driver.queryOne("SELECT status FROM data_migration_state WHERE migration_id = 'image-address-bytes-v1'")?.status;
  }), { timeout: 30_000 }).toBe('completed');
  const fixture = await desktopApp.evaluate(({ nativeImage }) => {
    const pathApi = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const crypto = process.getBuiltinModule('crypto')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { openDatabaseConnection } = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const { resolveRuntimeDataPaths } = require(pathApi.join(process.cwd(), 'dist/electron/database/runtimeDataPaths.js'));
    const bytes = nativeImage.createFromPath(pathApi.join(process.cwd(), 'assets/brand/foliole-leaf-tight.png')).resize({ width: 87 }).toPNG();
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const oldKey = `${hash}.webp`;
    const newKey = `${hash}.png`;
    const { assetsDir } = resolveRuntimeDataPaths();
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(pathApi.join(assetsDir, oldKey), bytes);
    openDatabaseConnection().driver.execute("DELETE FROM data_migration_state WHERE migration_id = 'image-address-bytes-v1'");
    return { oldKey, newKey };
  });
  await page.evaluate(async ({ oldKey }) => {
    await window.__folioleWorkspaceDebug!.seedNodes!([{ id: 'migration-image', kind: 'topic',
      title: 'Historical image migration', content: `![Historical image](asset://${oldKey})` }], { persist: true });
  }, fixture);
  const result = await desktopApp.evaluate(async (_, { oldKey }) => {
    const pathApi = process.getBuiltinModule('path')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const { openDatabaseConnection } = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const { submitDesktopOperation } = require(pathApi.join(process.cwd(), 'dist/electron/desktopOperations.js'));
    const { runImageAddressMigration } = require(pathApi.join(process.cwd(), 'dist/electron/attachments/imageAddressMigration.js'));
    const driver = openDatabaseConnection().driver;
    driver.execute('UPDATE nodes SET resource_references = ? WHERE id = ?',
      [JSON.stringify([{ storage_key: oldKey, role: 'image', original_name: 'Historical image.webp' }]), 'migration-image']);
    const first = await submitDesktopOperation('image-address-migration', { run: runImageAddressMigration }).promise;
    const version = driver.queryOne('SELECT current_version_id FROM nodes WHERE id = ?', ['migration-image']).current_version_id;
    const second = await submitDesktopOperation('image-address-migration', { run: runImageAddressMigration }).promise;
    return { first, second, version, after: driver.queryOne('SELECT current_version_id FROM nodes WHERE id = ?', ['migration-image']).current_version_id };
  }, fixture);
  expect(result.first).toEqual({ changed: 1, completed: true });
  expect(result.second).toEqual({ changed: 0, completed: true });
  expect(result.after).toBe(result.version);
  await page.evaluate(async () => window.__folioleWorkspaceDebug!.openNode!('migration-image'));
  const widget = page.locator('[data-md-image-editor-node-id="migration-image"]');
  await expect(widget).toHaveCount(1);
  await expect.poll(() => widget.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('[data-md-image-status="unavailable"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('migrated-image.png') });
});
