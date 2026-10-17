/* global atob, ClipboardEvent, DataTransfer, File, setTimeout, clearTimeout */
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
  const previousFlags = await page.evaluate(() => {
    const previous = [globalThis.__FOLIOLE_EDITOR_INPUT_DIAG, globalThis.__FOLIOLE_EDITOR_INPUT_DIAG_CONSOLE];
    globalThis.__FOLIOLE_EDITOR_INPUT_DIAG = true;
    globalThis.__FOLIOLE_EDITOR_INPUT_DIAG_CONSOLE = true;
    return previous;
  });
  const waiting = observeImageSave(page, nodeId);
  try {
    await page.locator('.prompt-editor-host .cm-content').evaluate((element, { bytes, name }) => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(bytes), value => value.charCodeAt(0))], name, { type: 'image/png' }));
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    }, { bytes, name: IMAGE_NAME });
    const applied = await waiting.result;
    if (!applied) throw new Error('image_content_local_save_rejected');
    const saved = await session.invoke('load_node_document', { nodeId });
    if (saved?.nodeId !== nodeId || !['![T363 original image]', INITIAL_BODY].every(text => saved.content?.includes(text))) {
      throw new Error('image_content_saved_body_mismatch');
    }
    return saved;
  } finally {
    waiting.close();
    await page.evaluate(([enabled, consoleEnabled]) => {
      if (enabled === undefined) delete globalThis.__FOLIOLE_EDITOR_INPUT_DIAG;
      else globalThis.__FOLIOLE_EDITOR_INPUT_DIAG = enabled;
      if (consoleEnabled === undefined) delete globalThis.__FOLIOLE_EDITOR_INPUT_DIAG_CONSOLE;
      else globalThis.__FOLIOLE_EDITOR_INPUT_DIAG_CONSOLE = consoleEnabled;
    }, previousFlags);
  }
}

function observeImageSave(page, nodeId) {
  let listener;
  let timer;
  const close = () => { clearTimeout(timer); page.off('console', listener); };
  const result = new Promise((resolve, reject) => {
    timer = setTimeout(() => { close(); reject(new Error('image_content_local_save_timeout')); }, 90_000);
    listener = async message => {
      if (!message.text().startsWith('[foliole-editor-input] update-node-content-runtime-persist ')) return;
      try {
        const details = await message.args()[3].jsonValue();
        if (details.nodeId !== nodeId) return;
        close(); resolve(details.applied === true);
      } catch (error) { close(); reject(error); }
    };
    page.on('console', listener);
  });
  void result.catch(() => undefined);
  return { result, close };
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

export async function showAndroidImageNavigation(page, args) {
  const review = page.getByTestId('companion-review-action-read');
  const browse = page.getByTestId('companion-tab-browse');
  await review.or(browse).first().waitFor({ state: 'visible' });
  if (await review.isVisible()) {
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  }
  await browse.waitFor({ state: 'visible' });
}

export async function openAndroidImageTopic(page, title, nodeId, args) {
  await showAndroidImageNavigation(page, args);
  await page.getByTestId('companion-tab-browse').click();
  await page.getByText(title, { exact: true }).click();
  await page.locator(`[data-companion-readable-document][data-node-id="${nodeId}"]`).waitFor();
}

export async function assertLoadedImages(page, selector) {
  const images = page.locator(`${selector}:not([aria-hidden="true"])`);
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
