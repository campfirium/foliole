import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('rejects a contradictory pack frontier and accepts the original pack afterward', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const outcome = await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const fs = process.getBuiltinModule('fs')!.promises;
    const path = process.getBuiltinModule('path')!;
    const os = process.getBuiltinModule('os')!;
    const load = (file: string) => require(path.join(process.cwd(), 'dist/electron', file));
    const { runWithDatabaseConnectionOwner, openDatabaseConnection } = load('database/connection.js');
    const { buildDesktopSyncPack } = load('database/syncPackBuilder.js');
    const { applyDesktopSyncGroupPack } = load('sync/desktopSyncGroupPackApply.js');
    const { writeStoredZip } = load('diagnostics/zipStore.js');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-envelope-acceptance-'));
    const args = { after: 0, peer: {
      endpoint_url: 'http://unused', group_id: 'isolated', local_device_id: 'target',
      peer_device_id: 'source', peer_device_name: 'Source'
    } };
    const snapshot = () => runWithDatabaseConnectionOwner(() =>
      openDatabaseConnection().driver.queryAll('SELECT * FROM sync_object_state ORDER BY object_type, object_id'));
    try {
      const outputPath = path.join(root, 'source.zip');
      const built = await runWithDatabaseConnectionOwner(() => buildDesktopSyncPack({
        outputPath, packId: 'acceptance', fromStateSeq: 0, fromPeerId: 'source', toPeerId: 'target'
      }));
      const original = await fs.readFile(outputPath);
      const files: Array<{ name: string; content: Buffer }> = [];
      let offset = 0;
      while (original.readUInt32LE(offset) === 0x04034b50) {
        const size = original.readUInt32LE(offset + 18);
        const nameLength = original.readUInt16LE(offset + 26);
        const start = offset + 30 + nameLength + original.readUInt16LE(offset + 28);
        const name = original.subarray(offset + 30, offset + 30 + nameLength).toString();
        let content = original.subarray(start, start + size);
        if (name === 'manifest.json') {
          const manifest = JSON.parse(content.toString());
          manifest.to_state_seq += 100;
          content = Buffer.from(JSON.stringify(manifest));
        }
        files.push({ name, content });
        offset = start + size;
      }
      await writeStoredZip(outputPath, files);
      const before = await snapshot();
      let error = '';
      try { await applyDesktopSyncGroupPack(args, await fs.readFile(outputPath), root); }
      catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      const unchanged = JSON.stringify(before) === JSON.stringify(await snapshot());
      const accepted = await applyDesktopSyncGroupPack(args, original, root);
      return { error, unchanged, cursor: accepted.cursor, expectedCursor: built.toStateSeq };
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  expectOutcome(outcome);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
});

function expectOutcome(outcome: { error: string; unchanged: boolean; cursor: number; expectedCursor: number }) {
  expect(outcome.error).toBe('sync_pack_inner_manifest_mismatch');
  expect(outcome.unchanged).toBe(true);
  expect(outcome.cursor).toBe(outcome.expectedCursor);
}
