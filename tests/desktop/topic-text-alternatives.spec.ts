import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-text-alternatives';
const MAIN = 'Main body retained as one whole version.';

async function seedAlternatives(app: ElectronApplication, page: Page) {
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes([{ id, content, kind: 'topic', title: 'Selectable bodies' }], { persist: true });
    await window.electronAPI?.invoke('update_node_content', {
      nodeId: id, content, kind: 'topic', title: 'Selectable bodies', parentNodeId: null,
      anchorLink: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      desiredRetention: null, hideTitleHeading: false, imageRegions: null, isTitleManual: true,
      position: 1, priority: null, reading: null, reveal: null, review: null, virtualFilter: null
    });
  }, { id: NODE_ID, content: MAIN });
  const home = await app.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME);
  if (!home) throw new Error('isolated_library_unavailable');
  const executable = process.platform === 'darwin'
    ? 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
    : 'node_modules/electron/dist/electron';
  execFileSync(path.resolve(executable), ['-e', `
    const db = new (require('better-sqlite3'))(process.argv[1]);
    const hash = text => require('node:crypto').createHash('sha256').update(text).digest('hex');
    const row = db.prepare('SELECT v.* FROM nodes n JOIN node_sync_versions v ON v.version_id=n.current_version_id WHERE n.id=?').get(process.argv[2]);
    const snapshot = JSON.parse(row.snapshot_json);
    const now = new Date().toISOString();
    const expiry = new Date(Date.now()+30*86400000).toISOString();
    snapshot.text_alternatives = ['B', 'C'].map(body => {
      const digest = hash('Alternative body '+body);
      const bytes = Buffer.from('Alternative body '+body);
      db.prepare("INSERT INTO content_blobs(hash,storage_key,kind,mime_type,compression,original_size_bytes,stored_size_bytes,original_sha256,stored_sha256,availability,created_at,cached_at,last_verified_at) VALUES (?,?,'text_body','text/plain','none',?,?,?,?, 'local',?,?,?) ON CONFLICT(hash) DO NOTHING").run(digest, 'text/'+digest, bytes.length, bytes.length, digest, digest, now, now, now);
      db.prepare('INSERT INTO content_blob_data(hash,data) VALUES (?,?) ON CONFLICT(hash) DO NOTHING').run(digest, bytes);
      return {id:body,body_blob_hash:digest,source_host_name:'Device '+body,created_at:now,expires_at:expiry};
    });
    db.prepare('UPDATE node_sync_versions SET snapshot_json=? WHERE version_id=?').run(JSON.stringify(snapshot),row.version_id);
    db.close();
  `, path.join(home, 'Data', 'foliole.db'), NODE_ID], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe'
  });
  await page.evaluate(async (id) => {
    await window.__folioleWorkspaceDebug?.openNode?.('special-inbox');
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, NODE_ID);
  const exitFlow = page.getByRole('button', { name: /Exit Flow|退出 Flow/ });
  if (await exitFlow.isVisible().catch(() => false)) await exitFlow.click();
}

async function preview(page: Page) {
  return page.evaluate(async (id) => window.electronAPI?.invoke('load_node_text_alternative_preview', { node_id: id }), NODE_ID);
}

async function openAlternatives(page: Page, count: number) {
  await page.getByRole('button', { name: new RegExp(`Alternative bodies \\(${count}\\)|备选正文.*${count}`) }).click();
  const dialog = page.getByRole('dialog', { name: /Comparison view|对比视图/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('selects, adopts and dismisses individual bodies while closing preserves alternatives', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedAlternatives(desktopApp, desktopWindow);
  await expect.poll(() => preview(desktopWindow)).toMatchObject({ alternatives: [{ id: 'B' }, { id: 'C' }] });
  let dialog = await openAlternatives(desktopWindow, 2);
  await expect(dialog.locator('.cm-content')).toContainText(['Main body retained', 'Alternative body B']);
  await dialog.getByRole('button', { name: /Alternative bodies \(2\)|备选正文（2）/ }).click();
  await desktopWindow.getByRole('menuitem', { name: /Device C/ }).click();
  await expect(dialog.locator('.cm-content').last()).toContainText('Alternative body C');
  mkdirSync('.tmp/artifacts', { recursive: true });
  await desktopWindow.screenshot({ path: '.tmp/artifacts/t329-alternative-selection.png' });
  await desktopWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await preview(desktopWindow)).toMatchObject({ alternatives: [{ id: 'B' }, { id: 'C' }] });
  dialog = await openAlternatives(desktopWindow, 2);
  await dialog.getByRole('button', { name: /Set as body|设为正文/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => preview(desktopWindow)).toMatchObject({ current_content: 'Alternative body C', alternatives: [{ id: 'B' }] });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  expect(await preview(desktopWindow)).toMatchObject({ current_content: 'Alternative body C', alternatives: [{ id: 'B' }] });
  dialog = await openAlternatives(desktopWindow, 1);
  await dialog.getByRole('button', { name: /Remove alternative|移除此备选/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => preview(desktopWindow)).toBeNull();
});
