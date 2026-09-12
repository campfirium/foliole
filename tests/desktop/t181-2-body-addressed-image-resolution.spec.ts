import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const IMAGE_PATH = path.resolve('assets/brand/foliole-leaf-tight.png');
const PDF_PATH = path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf');
const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const REMOTE_URL = 'https://images.example.com/t181-cover.jpeg';
const PDF_TEXT = 'Foliole PDF User Journey Page 1 alpha keyword';

async function installPdfSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
  }, PDF_PATH);
}

async function openNode(page: Page, nodeId: string) {
  const opened = await page.evaluate(async (id) =>
    window.__folioleWorkspaceDebug?.openNode?.(id) ?? false, nodeId);
  expect(opened).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)).toBe(nodeId);
}

async function exitFlowIfNeeded(page: Page) {
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible().catch(() => false)) {
    await exitFlow.click();
    await expect(exitFlow).toBeHidden();
  }
}

async function openTopic(page: Page, nodeId: string, title: string) {
  await exitFlowIfNeeded(page);
  await page.getByRole('treeitem', { exact: true, name: title }).click();
  await exitFlowIfNeeded(page);
  await expect.poll(() => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null)).toBe(nodeId);
}

async function expectImageReady(page: Page, storageKey: string) {
  const image = page.locator(`img[src^="foliole-asset://attachment/${storageKey}"]`).first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  return image.getAttribute('src');
}

async function localizeImageFixture(page: Page, bytes: Buffer, nodeId: string, storageKey: string) {
  return page.evaluate(async ({ bytesBase64, nodeId: id, storageKey: key }) => {
    const attachmentId = await window.__folioleWorkspaceDebug?.importClipboardImageAttachment?.({
      bytesBase64, mimeType: 'image/png', nodeId: id, originalName: 'localized-remote.png'
    });
    if (!attachmentId) return null;
    await window.__folioleWorkspaceDebug?.updateNodeContent?.(id, `![Remote cover](asset://${key})`);
    return attachmentId;
  }, { bytesBase64: bytes.toString('base64'), nodeId, storageKey });
}

async function importPdf(desktopApp: ElectronApplication, page: Page) {
  await installPdfSelection(desktopApp);
  const result = await page.evaluate(async () => window.electronAPI?.invoke('run_text_file_import', {}));
  if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
    throw new Error(`PDF import did not create a node: ${JSON.stringify(result)}`);
  }
  return result.node_id;
}

async function expectPdfReady(page: Page, nodeId: string) {
  await openNode(page, nodeId);
  await exitFlowIfNeeded(page);
  const region = page.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ });
  await expect(region).toBeVisible();
  await expect(region).toContainText(PDF_TEXT);
}

async function writeEvidence(input: {
  content: string;
  initialImageSource: string | null;
  imageSource: string | null;
  pdfNodeId: string;
  screenshotPath: string;
  storageKey: string;
  testInfo: TestInfo;
}) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const evidencePath = path.join(ARTIFACT_DIR, 't181-2-body-addressed-image-resolution.json');
  const { testInfo, ...evidence } = input;
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await testInfo.attach('t181-2-body-addressed-image-resolution', {
    contentType: 'application/json', path: evidencePath
  });
}

test('keeps a localized remote image and PDF readable after offline relaunch', async ({ desktopSession }, testInfo) => {
  test.setTimeout(180_000);
  const bytes = await fs.readFile(IMAGE_PATH);
  const storageKey = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  const runId = randomUUID();
  const imageNodeId = `t181-2-body-addressed-image-${runId}`;
  const otherNodeId = `t181-2-other-node-${runId}`;
  const remoteUrl = `${REMOTE_URL}?run=${runId}`;
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(desktopSession.firstWindow);
    await desktopSession.firstWindow.evaluate(() => {
      window.localStorage.setItem('foliole-auto-localize-remote-images', 'false');
    });
    await desktopSession.firstWindow.evaluate(async ({ imageNodeId, otherNodeId, remoteUrl }) => {
      await window.__folioleWorkspaceDebug?.seedNodes?.([
        { content: `![Remote cover](${remoteUrl})`, id: imageNodeId, kind: 'topic', title: 'Body addressed image' },
        { content: 'Switch target', id: otherNodeId, kind: 'topic', title: 'Other node' }
      ], { persist: true });
    }, { imageNodeId, otherNodeId, remoteUrl });
    await openTopic(desktopSession.firstWindow, imageNodeId, 'Body addressed image');
    await expect.poll(async () => (await loadNodeDocument(desktopSession.firstWindow, imageNodeId))?.content)
      .toContain(remoteUrl);
    const initialImageSource = remoteUrl;
    const localized = await localizeImageFixture(desktopSession.firstWindow, bytes, imageNodeId, storageKey);
    expect(localized).toBe(storageKey.slice(0, 64));
    await expect.poll(() => desktopSession.firstWindow.evaluate((id) =>
      window.__folioleWorkspaceDebug?.getNode?.(id)?.content ?? '', imageNodeId), { timeout: 20_000 })
      .toContain(`asset://${storageKey}`);
    await expect.poll(async () => (await loadNodeDocument(desktopSession.firstWindow, imageNodeId))?.content, {
      timeout: 20_000
    })
      .toContain(`asset://${storageKey}`);
    await expectImageReady(desktopSession.firstWindow, storageKey);
    await openTopic(desktopSession.firstWindow, otherNodeId, 'Other node');
    await openTopic(desktopSession.firstWindow, imageNodeId, 'Body addressed image');
    await expectImageReady(desktopSession.firstWindow, storageKey);

    const pdfNodeId = await importPdf(desktopSession.electronApp, desktopSession.firstWindow);
    await expectPdfReady(desktopSession.firstWindow, pdfNodeId);
    await desktopSession.electronApp.close();

    secondSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    await expectWorkspaceShell(secondSession.firstWindow);
    await openNode(secondSession.firstWindow, imageNodeId);
    await exitFlowIfNeeded(secondSession.firstWindow);
    const imageSource = await expectImageReady(secondSession.firstWindow, storageKey);
    const screenshotPath = path.join(ARTIFACT_DIR, 't181-2-offline-reopen.png');
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    await secondSession.firstWindow.screenshot({ path: screenshotPath });
    await testInfo.attach('t181-2-offline-reopen', { contentType: 'image/png', path: screenshotPath });
    await expectPdfReady(secondSession.firstWindow, pdfNodeId);
    await writeEvidence({
      content: (await loadNodeDocument(secondSession.firstWindow, imageNodeId))?.content ?? '',
      imageSource, initialImageSource, pdfNodeId, screenshotPath, storageKey, testInfo
    });
  } finally {
    await secondSession?.close();
  }
});
