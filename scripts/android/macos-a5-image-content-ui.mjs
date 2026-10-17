/* global atob, ClipboardEvent, DataTransfer, File */
import fs from 'node:fs';
import path from 'node:path';

import { _android } from 'playwright';

import { ACCEPTANCE_APP_ID } from './macos-a5-acceptance-package-cleanup.mjs';
import { webViewSocketForPid } from './macos-a5-t234-webview-session.mjs';

export const IMAGE_NAME = 'T363 original image.png';
export const INITIAL_BODY = 'T363 initial body';
export const ANDROID_MARKER = 'T363 saved on Android';

export async function pasteMacImage(session, args, nodeId) {
  const page = session.page;
  await page.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  await page.locator('.prompt-editor-host').getByText(INITIAL_BODY, { exact: true }).waitFor();
  const bytes = fs.readFileSync(path.join(args.paths.buildRoot, 'assets/brand/foliole-leaf-tight.png')).toString('base64');
  const waiting = session.waitForState({ command: 'load_node_document', commandArgs: { nodeId },
    condition: { kind: 'node-content-includes', nodeId, fragments: ['![T363 original image]', INITIAL_BODY] },
    eventName: 'onWorkspaceContentChanged' });
  await page.locator('.prompt-editor-host .cm-content').evaluate((element, { bytes, name }) => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob(bytes), value => value.charCodeAt(0))], name, { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, { bytes, name: IMAGE_NAME });
  return waiting;
}

export async function connectImageWebView(args, device) {
  const pid = Number(args.captured(args.paths.adb, ['-s', args.serial, 'shell', 'pidof', ACCEPTANCE_APP_ID]));
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('image_content_pid_unavailable');
  const socket = webViewSocketForPid(args.captured(args.paths.adb,
    ['-s', args.serial, 'shell', 'cat', '/proc/net/unix']), pid);
  const page = await (await device.webView({ pkg: ACCEPTANCE_APP_ID, socketName: socket }, { timeout: 30_000 })).page();
  page.setDefaultTimeout(30_000);
  return { page, pid, socket };
}

export async function imageDevice(serial) {
  const devices = await _android.devices({ omitDriverInstall: true });
  const device = devices.find(candidate => candidate.serial() === serial);
  if (!device) { await Promise.all(devices.map(value => value.close())); throw new Error('image_content_fixed_a5_unavailable'); }
  return { device, close: () => Promise.all(devices.map(value => value.close())) };
}

export async function openAndroidImageTopic(page, title, nodeId) {
  await page.getByTestId('companion-tab-browse').click();
  await page.getByText(title, { exact: true }).click();
  await page.locator(`[data-companion-readable-document][data-node-id="${nodeId}"]`).waitFor();
}

export async function assertLoadedImages(page, selector) {
  const images = page.locator(selector);
  await images.first().waitFor({ state: 'visible' });
  const loaded = await images.evaluateAll(elements => Promise.all(elements.map(image => image.complete
    ? image.naturalWidth > 0 : new Promise(resolve => {
      image.addEventListener('load', () => resolve(image.naturalWidth > 0), { once: true });
      image.addEventListener('error', () => resolve(false), { once: true });
    }))));
  if (loaded.length !== 1 || loaded.some(value => !value)) throw new Error('image_content_image_not_loaded');
}

export async function editAndroidBody(page, content) {
  await page.getByText(INITIAL_BODY, { exact: true }).click();
  await page.getByTestId('companion-reading-edit').click();
  await page.locator('[data-companion-readable-document] .cm-content').fill(`${content}\n\n${ANDROID_MARKER}`);
  await page.getByTestId('companion-reading-edit-done').click();
  await page.getByTestId('companion-reading-edit-done').waitFor({ state: 'hidden' });
}
