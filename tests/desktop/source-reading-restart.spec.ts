import { writeFile } from 'node:fs/promises';
import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function readingSnapshot(session: DesktopSession) {
  return session.firstWindow.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return { source: snapshot.nodesById['batch-source']?.sequentialReadingEnabled,
      movedSource: snapshot.nodesById['batch-moved']?.sequentialReadingEnabled,
      destinationSource: snapshot.nodesById['batch-destination']?.sequentialReadingEnabled,
      parent: snapshot.nodesById['batch-moved']?.parentNodeId,
      readings: Array.from({ length: 30 }, (_, index) =>
        snapshot.nodesById[`batch-reading-${index}`]?.reading) };
  });
}

test('moving a subtree out of sequential reading unlocks every topic and survives process restart', async ({ desktopSession, desktopWindow: page }, testInfo) => {
  let reopened: DesktopSession | null = null;
  try {
    await expectWorkspaceShell(page);
    await page.evaluate(async () => {
      const stamp = '2026-10-20T00:00:00.000Z';
      await window.__folioleWorkspaceDebug!.seedNodes([
        { id: 'batch-source', kind: 'folder', title: 'Sequential source', content: '' },
        { id: 'batch-destination', kind: 'folder', title: 'Destination', content: '' },
        { id: 'batch-moved', kind: 'folder', title: 'Moved subtree', content: '', parentNodeId: 'batch-source' },
        ...Array.from({ length: 30 }, (_, index) => ({ id: `batch-reading-${index}`,
          kind: 'topic' satisfies 'topic', title: `Reading ${index}`, content: `Preserved body ${index}`,
          parentNodeId: 'batch-moved', reading: { state: 'locked' satisfies 'locked',
            intervalDurationMs: 1234, intervalGrowthFactor: 1.5, lastHandledAt: stamp,
            nextAt: stamp, priority: 5, readingPosition: 17, repetitionCount: 2 } }))
      ], { persist: true });
    });
    await page.locator('[data-node-id="batch-source"]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Enable sequential reading|开启顺序阅读/i }).click();
    await expect.poll(async () => {
      const saved = await readingSnapshot(desktopSession);
      const visible = await page.evaluate(() => Array.from({ length: 30 }, (_, index) =>
        window.__folioleWorkspaceDebug!.getNode(`batch-reading-${index}`)?.reading));
      return saved.source === true && JSON.stringify(saved.readings) === JSON.stringify(visible);
    }).toBe(true);
    const before = await readingSnapshot(desktopSession);
    expect(before.source).toBe(true);
    expect(before.readings.some(reading => reading?.state === 'locked')).toBe(true);
    expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.moveNodes(
      ['batch-moved'], 'batch-destination', 'child'))).toBe(true);
    await expect.poll(async () => (await readingSnapshot(desktopSession)).parent).toBe('batch-destination');
    const diagnostic = { saved: await readingSnapshot(desktopSession),
      visible: await page.evaluate(() => Array.from({ length: 30 }, (_, index) =>
        window.__folioleWorkspaceDebug!.getNode(`batch-reading-${index}`))) };
    await writeFile('.tmp/artifacts/unified-acceptance-20261020/t300-move-diagnostic.json', JSON.stringify(diagnostic));
    const moved = await readingSnapshot(desktopSession);
    expect(moved.readings).toHaveLength(30);
    for (const reading of moved.readings) expect(reading).toMatchObject({ state: 'active', repetitionCount: 2 });
    const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot };
    await desktopSession.electronApp.close();
    reopened = await launchDesktopSession({ env });
    await expectWorkspaceShell(reopened.firstWindow);
    expect(await readingSnapshot(reopened)).toEqual(moved);
    await reopened.firstWindow.evaluate(() => window.__folioleWorkspaceDebug!.openNode('batch-reading-29'));
    await expect(reopened.firstWindow.getByText('Preserved body 29', { exact: true })).toBeVisible();
    await testInfo.attach('batch-reading-restart', { body: await reopened.firstWindow.screenshot({
      path: `${process.cwd()}/.tmp/artifacts/unified-acceptance-20261020/t300-reading-restart.png` }), contentType: 'image/png' });
    await testInfo.attach('batch-reading-facts', { body: JSON.stringify({ before, moved }), contentType: 'application/json' });
  } finally { await reopened?.close(); }
});

async function readwiseFacts(session: DesktopSession) {
  return session.firstWindow.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return snapshot.nodesById['latest-source-topic']?.readwiseRemoteLifecycle;
  });
}

test('latest source status and its reading entry remain available after process restart', async ({ desktopSession, desktopWindow: page }, testInfo) => {
  let reopened: DesktopSession | null = null;
  try {
    await expectWorkspaceShell(page);
    await page.evaluate(() => window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'latest-source-topic', title: 'Latest source topic', kind: 'topic', content: 'Readable source body' }
    ], { persist: true }));
    await desktopSession.electronApp.evaluate(async () => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
      await new Promise<void>(resolve => setImmediate(resolve));
      await connection.runWithDatabaseConnectionOwner(() => {
        const statement = connection.openDatabaseConnection().sqlite.prepare(`INSERT INTO import_sources (
          source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
          last_imported_at, last_content_fingerprint, latest_node_id, remote_provider, remote_import_state_json
        ) VALUES (?, 'fixture', 'document', 'fixture', 'fixture', '2026-10-01', ?, 'fixture',
          'latest-source-topic', 'readwise', ?)`);
        for (const [id, date, reader] of [['old-source', '2026-10-01', 'missing'], ['latest-source', '2026-10-02', 'present']]) {
          statement.run(id, date, JSON.stringify({ remoteLifecycle: { checkedAt: '2026-10-02T00:00:00.000Z',
            connectionRef: 'fixture', export: 'present', reader, scope: { readerLocation: 'all', version: 1 } } }));
        }
      });
    });
    const before = await readwiseFacts(desktopSession);
    expect(before).toMatchObject({ reader: 'present', export: 'present' });
    const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot };
    await desktopSession.electronApp.close();
    reopened = await launchDesktopSession({ env });
    await expectWorkspaceShell(reopened.firstWindow);
    expect(await readwiseFacts(reopened)).toEqual(before);
    await reopened.firstWindow.evaluate(() => window.__folioleWorkspaceDebug!.openNode('latest-source-topic'));
    await expect(reopened.firstWindow.getByText('Readable source body', { exact: true })).toBeVisible();
    await testInfo.attach('source-status-restart', { body: await reopened.firstWindow.screenshot({
      path: `${process.cwd()}/.tmp/artifacts/unified-acceptance-20261020/t301-source-restart.png` }), contentType: 'image/png' });
  } finally { await reopened?.close(); }
});
