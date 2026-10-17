// @vitest-environment jsdom
/* global console, Event, document, process */
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';

import { createUpdateNodeContentMetrics } from '../../src/store/workspaceNodeContentUpdateDiagnostics';
import { resetPendingNodeContentRuntimePersistsForTests, scheduleNodeContentRuntimePersist,
  drainPendingNodeContentRuntimePersists } from '../../src/store/workspaceStoreContentRuntimePersist';
import { syncNodeContentWithAnchorsMutationToRuntime } from '../../src/store/workspaceRuntimeSync';
import { waitForDesktopProductState } from '../acceptance/desktop-product-event.mjs';
import { INITIAL_BODY, assertLoadedImages, connectImageWebView, openAndroidImageTopic, pasteMacImage } from './macos-a5-image-content-ui.mjs';

vi.mock('../../src/store/workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: () => true,
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn()
}));
afterEach(() => {
  resetPendingNodeContentRuntimePersistsForTests();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function fixture({ accepted = true, persistedContent } = {}) {
  const nodeId = 'image-node';
  const content = `![T363 original image](asset://image.png)${INITIAL_BODY}`;
  let document = { nodeId, content: INITIAL_BODY };
  let release;
  const response = new Promise(resolve => { release = resolve; });
  let started;
  const saving = new Promise(resolve => { started = resolve; });
  syncNodeContentWithAnchorsMutationToRuntime.mockImplementation(async () => {
    started(); await response;
    document = { nodeId, content: persistedContent ?? content };
    return accepted ? { nodes: [] } : null;
  });
  const events = new EventEmitter();
  vi.spyOn(console, 'info').mockImplementation((...args) => events.emit('console', {
    text: () => args.join(' '), args: () => args.map(value => ({ jsonValue: async () => value }))
  }));
  vi.stubGlobal('DataTransfer', class { items = { add() {} }; });
  vi.stubGlobal('ClipboardEvent', class extends Event {});
  const invoke = vi.fn(async () => document);
  vi.stubGlobal('electronAPI', { invoke, onWorkspaceContentChanged: () => () => {} });
  const element = documentElement();
  element.addEventListener('paste', () => {
    const node = { id: nodeId, content, kind: 'topic', title: 'Image',
      createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:01Z' };
    scheduleNodeContentRuntimePersist({ contentLength: content.length,
      diagnosticsEnabled: globalThis.__FOLIOLE_EDITOR_INPUT_DIAG === true,
      localState: { localPatch: null, locatorUpdatedNodesForSync: [], nextNodeForSync: node, nodeOrderForSync: [nodeId] },
      metrics: createUpdateNodeContentMetrics(true), nextNodeForSync: node, set: () => {}, version: 1 });
    void drainPendingNodeContentRuntimePersists();
  });
  const locator = { click: async () => {}, waitFor: async () => {}, getByText: () => locator,
    evaluate: (callback, args) => callback(element, args) };
  const page = { locator: () => locator, evaluate: (callback, args) => callback(args),
    on: (...args) => events.on(...args), off: (...args) => events.off(...args) };
  const session = { page, invoke, waitForState: options => waitForDesktopProductState(page, { ...options, timeoutMs: 150 }) };
  return { invoke, release, saving, content, nodeId, session };
}
function documentElement() { return document.createElement('div'); }

it('waits for the same-window save response before reading the persisted image once', async () => {
  const f = fixture();
  const pending = pasteMacImage(f.session, { paths: { buildRoot: process.cwd() } }, f.nodeId);
  await f.saving;
  expect(f.invoke).not.toHaveBeenCalled();
  f.release();
  await expect(pending).resolves.toEqual({ nodeId: f.nodeId, content: f.content });
  expect(f.invoke).toHaveBeenCalledTimes(1);
  expect(globalThis.__FOLIOLE_EDITOR_INPUT_DIAG).toBeUndefined();
  expect(globalThis.__FOLIOLE_EDITOR_INPUT_DIAG_CONSOLE).toBeUndefined();
});

it.each([
  [{ accepted: false }, 'image_content_local_save_rejected', 0],
  [{ persistedContent: INITIAL_BODY }, 'image_content_saved_body_mismatch', 1]
])('rejects an unsuccessful save or mismatched persisted image: %j', async (options, error, reads) => {
  const f = fixture(options);
  const pending = pasteMacImage(f.session, { paths: { buildRoot: process.cwd() } }, f.nodeId);
  await f.saving;
  f.release();
  await expect(pending).rejects.toThrow(error);
  expect(f.invoke).toHaveBeenCalledTimes(reads);
  expect(globalThis.__FOLIOLE_EDITOR_INPUT_DIAG).toBeUndefined();
});

it.each([true, false])('opens the image topic from review=%s without exiting another surface', async initiallyReviewing => {
  let reviewing = initiallyReviewing;
  const calls = [];
  const locator = id => ({
    or: () => ({ first: () => ({ waitFor: async () => {} }) }),
    isVisible: async () => reviewing && id === 'companion-review-action-read',
    click: async () => {
      if (reviewing) throw new Error('navigation_hidden_by_review');
      calls.push(id);
    },
    waitFor: async () => {}
  });
  const page = { getByTestId: locator, getByText: locator, locator };
  const args = { paths: { adb: '/adb' }, serial: 'fixed', checked: vi.fn(() => { reviewing = false; }) };
  await openAndroidImageTopic(page, 'Image topic', 'image-node', initiallyReviewing ? args : undefined);
  expect(args.checked).toHaveBeenCalledTimes(initiallyReviewing ? 1 : 0);
  if (initiallyReviewing) expect(args.checked).toHaveBeenCalledWith('/adb', ['-s', 'fixed', 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  expect(calls).toEqual(['companion-tab-browse', 'Image topic']);
});

it('checks the loaded content image while ignoring editor decoration images', async () => {
  const root = document.createElement('article');
  root.innerHTML = '<img aria-hidden="true"><img src="asset://image.png">';
  const image = root.querySelector('img[src]');
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 64 } });
  const page = { locator: selector => {
    const images = [...root.querySelectorAll(selector)];
    return { first: () => ({ waitFor: async () => {
      if (!images[0] || images[0].getAttribute('aria-hidden') === 'true') throw new Error('hidden_decoration_image');
    } }), evaluateAll: callback => callback(images) };
  } };
  await expect(assertLoadedImages(page, 'img')).resolves.toBeUndefined();
  image.remove();
  await expect(assertLoadedImages(page, 'img')).rejects.toThrow();
});

it('binds the new process socket when a closed WebView for the same package remains discoverable', async () => {
  const page = { setDefaultTimeout: vi.fn(), closed: false };
  const oldPage = { setDefaultTimeout: vi.fn(), closed: true };
  const view = (pid, value) => ({ pid: () => pid, pkg: () => 'com.campfirium.foliole.android.acceptance', page: async () => value });
  const device = { webView: async selector => selector.pkg ? view(10, oldPage) : view(20, page) };
  const args = { paths: { adb: '/adb' }, serial: 'fixed', captured: (_command, argv) =>
    argv.includes('pidof') ? '20' : 'socket webview_devtools_remote_20' };
  const binding = await connectImageWebView(args, device);
  expect(binding.page).toBe(page);
  expect(binding.pid).toBe(20);
  expect(binding.socket).toBe('webview_devtools_remote_20');
});

it('waits for the cold-start review task before leaving it, even when tabs appear during bootstrap', async () => {
  let reviewReady = false;
  let leftReview = false;
  const args = { paths: { adb: '/adb' }, serial: 'fixed', checked: () => {
    if (!reviewReady) throw new Error('back_before_review_ready');
    leftReview = true;
  } };
  const locator = id => ({
    or: () => ({ first: () => ({ waitFor: async () => {} }) }),
    isVisible: async () => reviewReady,
    waitFor: async () => {
      if (id === 'companion-review-action-read') reviewReady = true;
      else if (!leftReview) throw new Error('review_replaced_bootstrap_tabs');
    },
    click: async () => { if (!leftReview) throw new Error('review_replaced_bootstrap_tabs'); }
  });
  const page = { getByTestId: locator, getByText: locator, locator };
  await expect(openAndroidImageTopic(page, 'Image topic', 'image-node', args)).resolves.toBeUndefined();
});
