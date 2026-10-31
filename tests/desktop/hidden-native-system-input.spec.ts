import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type Rectangle = { x: number; y: number; width: number; height: number };
const OUTPUT_ROOT = path.resolve('.tmp/artifacts/hidden-native-system-input');

// SKIP: Real OS input requires explicit user authorization | 2026-10-31 | revive: macOS with FOLIOLE_ALLOW_SYSTEM_MOUSE_MOVES=1
test.skip(process.platform !== 'darwin' || process.env.FOLIOLE_ALLOW_SYSTEM_MOUSE_MOVES !== '1',
  'Requires explicit opt-in to move the macOS system pointer');

async function startSystemMouseMoves(app: ElectronApplication, bounds: Rectangle, binary: string) {
  const frame = await app.evaluate(({ BrowserWindow, screen }) => ({
    bounds: BrowserWindow.getAllWindows()[0]!.getBounds(), cursor: screen.getCursorScreenPoint()
  }));
  const driver = spawn(binary, [
    String(frame.bounds.x + bounds.x), String(frame.bounds.y + bounds.y),
    String(bounds.width), String(bounds.height),
    String(frame.bounds.x + frame.bounds.width + 10), String(frame.bounds.y + 100)
  ]);
  let output = '';
  driver.stdout.on('data', chunk => { output += String(chunk); });
  const finished = new Promise<void>((resolve, reject) => {
    driver.on('error', reject);
    driver.on('close', code => code === 0 ? resolve() : reject(new Error(`Native driver exit ${code}`)));
  });
  return { finished, frame, output: () => output };
}

async function createImageCloze(page: Page, parentId: string, app: ElectronApplication, binary: string) {
  await page.getByRole('region', { name: /Left toolbar|左侧工具栏/ })
    .getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('cloze');
  await palette.locator('button[aria-label="Cloze Selection"], button[aria-label="挖空所选内容"]').click();
  const surface = page.locator('.cm-md-image-surface-block').first();
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('Expected source image');
  const stimulus = await startSystemMouseMoves(app, bounds, binary);
  try {
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.75, { steps: 8 });
    await page.mouse.up();
    await stimulus.finished;
    await page.getByRole('button', { name: 'Confirm image cloze' }).click({ timeout: 3000 });
  } finally {
    await stimulus.finished;
    const after = await app.evaluate(({ screen, BrowserWindow }) => ({
      cursor: screen.getCursorScreenPoint(), focused: BrowserWindow.getFocusedWindow() !== null
    }));
    fs.writeFileSync(path.join(OUTPUT_ROOT, 'environment.json'), JSON.stringify({
      nativeOutput: stimulus.output(), before: stimulus.frame, after
    }, null, 2));
    expect(after.focused).toBe(false);
    // Each phase has 45 moves, so >45 verified positions proves both phases ran.
    expect(Number(stimulus.output().match(/verified (\d+)/)?.[1])).toBeGreaterThan(45);
  }
  await expect.poll(() => page.evaluate(id => window.__folioleWorkspaceDebug!.listNodes()
    .map(({ id }) => window.__folioleWorkspaceDebug!.getNode(id))
    .filter(node => node?.parentNodeId === id && node.anchorKind === 'cloze').length, parentId)).toBe(1);
}

async function seedImageSource(page: Page) {
  const bytes = fs.readFileSync(path.resolve('assets/brand/foliole-leaf-tight.png'));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const ownerId = 'hidden-native-system-input-source';
  await page.evaluate(async ({ ownerId, hash, bytesBase64 }) => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([{ id: ownerId, kind: 'topic', title: 'Image source',
      content: `![Original image](asset://${hash}.png)` }], { persist: true });
    await debug.importClipboardImageAttachment!({ bytesBase64, mimeType: 'image/png',
      nodeId: ownerId, originalName: 'original.png' });
    await debug.openNode(ownerId);
  }, { ownerId, hash, bytesBase64: bytes.toString('base64') });
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some(image => image.complete && image.naturalWidth > 0));
  return ownerId;
}

test('system mouse activity cannot cancel hidden image confirmation', async ({ desktopApp, desktopWindow: page }, info) => {
  expect(process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).toBe('1');
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const binary = path.join(OUTPUT_ROOT, 'system-mouse-moves');
  execFileSync('swiftc', [path.resolve('tests/desktop/harness/systemMouseMoves.swift'), '-o', binary]);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(() => window.__folioleWorkspaceDebug!.seedNodes([
    { id: 'hidden-native-system-input-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
  ], { persist: true }));
  const parentId = await seedImageSource(page);
  await createImageCloze(page, parentId, desktopApp, binary);
  await info.attach('system-mouse-input', { path: path.join(OUTPUT_ROOT, 'environment.json'), contentType: 'application/json' });
});
