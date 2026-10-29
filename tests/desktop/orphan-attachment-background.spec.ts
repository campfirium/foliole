import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('observes attachments through the background worker while the native main loop remains responsive', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const result = await desktopApp.evaluate(async () => {
    const pathApi = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const crypto = process.getBuiltinModule('crypto')!;
    const require = process.getBuiltinModule('module')!.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), 'dist/electron', name));
    const { upsertNodeSnapshot } = load('database/nodeMutations.js');
    const { assetsDir } = load('database/runtimeDataPaths.js').resolveRuntimeDataPaths();
    const { runDesktopAttachmentMaintenance } = load('attachments/attachmentMaintenanceService.js');
    const { openDatabaseConnection } = load('database/connection.js');
    const bytes = 'retained attachment';
    const key = `${crypto.createHash('sha256').update(bytes).digest('hex')}.png`;
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(pathApi.join(assetsDir, key), bytes);
    for (let i = 0; i < 200; i++) upsertNodeSnapshot({ nodeId: `background-${i}`, parentNodeId: null,
      kind: 'topic', title: 'Background observation', isTitleManual: true,
      content: `![image](asset://${key}) ${'paragraph '.repeat(820)}`, reveal: null, anchorLink: null, position: null,
      createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z' });
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 1);
    try {
      const first = await runDesktopAttachmentMaintenance({ action: 'observe' });
      const second = await runDesktopAttachmentMaintenance({ action: 'observe' });
      const cached = openDatabaseConnection().sqlite.prepare(
        "SELECT count(*) FROM attachment_reference_cache WHERE node_id LIKE 'background-%'").pluck().get();
      return { first: first.observationComplete, second: second.observationComplete, cached, ticks,
        retained: fs.readFileSync(pathApi.join(assetsDir, key), 'utf8') === bytes, trashBytes: second.trashBytes };
    } finally { clearInterval(timer); }
  });
  expect(result).toMatchObject({ first: true, second: true, cached: 200, retained: true, trashBytes: 0 });
  expect(result.ticks).toBeGreaterThan(0);
  await expectWorkspaceShell(page);
});
