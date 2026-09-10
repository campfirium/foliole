import { undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

const { importRemoteImageAttachment } = vi.hoisted(() => ({
  importRemoteImageAttachment: vi.fn()
}));

vi.mock('../../../shared/platform/remoteImageLocalization', () => ({
  importRemoteImageAttachment
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const IMAGE_HASH = 'a'.repeat(64);
const IMAGE_URL = `asset://${IMAGE_HASH}.png`;

function getEditorView(adapter: CodeMirrorEditorAdapter) {
  return (adapter as unknown as { view: EditorView }).view;
}

async function waitForLocalization() {
  await vi.advanceTimersByTimeAsync(1_600);
  await Promise.resolve();
  await Promise.resolve();
}

function createAdapter(onChange = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  return {
    adapter: new CodeMirrorEditorAdapter(host, {
      initialContent: '',
      onChange
    }),
    onChange
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  importRemoteImageAttachment.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

it('rewrites remote markdown images by default after editor content changes', async () => {
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'attachment-1',
    hash: IMAGE_HASH,
    mime_type: 'image/png',
    original_name: 'cover.png'
  });
  const { adapter, onChange } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](https://example.com/cover.png)');
  await waitForLocalization();

  expect(adapter.getContent()).toBe(`![Remote](${IMAGE_URL})`);
  expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/cover.png');
  expect(onChange).toHaveBeenLastCalledWith(`![Remote](${IMAGE_URL})`, { nodeId: 'node-1' });
  expect(window.confirm).not.toHaveBeenCalled();

  adapter.destroy();
});

it('does not restore the remote image URL from editor undo history', async () => {
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'attachment-1',
    hash: IMAGE_HASH,
    mime_type: 'image/png',
    original_name: 'cover.png'
  });
  const { adapter } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](https://example.com/cover.png)');
  await waitForLocalization();

  expect(adapter.getContent()).toBe(`![Remote](${IMAGE_URL})`);
  undo(getEditorView(adapter));
  expect(adapter.getContent()).toBe(`![Remote](${IMAGE_URL})`);

  adapter.destroy();
});

it('rewrites large remote images as standalone blocks after editor localization', async () => {
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'attachment-1',
    hash: IMAGE_HASH,
    mime_type: 'image/png',
    intrinsic_size: { height: 960, width: 1280 },
    original_name: 'cover.png'
  });
  const { adapter, onChange } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('Before ![Remote](https://example.com/cover.png) after');
  await waitForLocalization();

  expect(adapter.getContent()).toBe(`Before\n\n![Remote](${IMAGE_URL})\n\nafter`);
  expect(onChange).toHaveBeenLastCalledWith(`Before\n\n![Remote](${IMAGE_URL})\n\nafter`, { nodeId: 'node-1' });

  adapter.destroy();
});

it('rewrites remote markdown images when the setting is explicitly enabled', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'true');
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'attachment-1',
    hash: IMAGE_HASH,
    mime_type: 'image/png',
    original_name: 'cover.png'
  });
  const { adapter } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](https://example.com/cover.png)');
  await waitForLocalization();

  expect(window.confirm).not.toHaveBeenCalled();
  expect(adapter.getContent()).toBe(`![Remote](${IMAGE_URL})`);

  adapter.destroy();
});

it('detects remote markdown images through the shared image parser before rewriting', async () => {
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'attachment-1',
    hash: IMAGE_HASH,
    mime_type: 'image/png',
    original_name: 'cover.png'
  });
  const { adapter } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](<https://example.com/cover.png> "Title")');
  await waitForLocalization();

  expect(adapter.getContent()).toBe(`![Remote](${IMAGE_URL} "Title")`);
  expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/cover.png');

  adapter.destroy();
});

it('preserves image-only wrapping links when localizing remote markdown images', async () => {
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'attachment-1',
    hash: IMAGE_HASH,
    mime_type: 'image/png',
    intrinsic_size: { height: 816, width: 1456 },
    original_name: 'cover.png'
  });
  const { adapter } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection(
    '[\n\n![](https://blogger.googleusercontent.com/img/a/cover)\n\n](https://blogger.googleusercontent.com/img/a/cover)正文'
  );
  await waitForLocalization();

  expect(adapter.getContent()).toBe(`[![](${IMAGE_URL})](https://blogger.googleusercontent.com/img/a/cover)\n\n正文`);

  adapter.destroy();
});

it('keeps stale remote wrappers around already localized images after the node opens', async () => {
  const { adapter, onChange } = createAdapter();

  adapter.setContent(
    `[\n\n![image](${IMAGE_URL})\n\nimage1971×1242 140 KB](https://cdn.example.com/uploads/original/2X/f/cover.png)\n正文`
  );
  adapter.setNodeId('node-1');
  await waitForLocalization();

  expect(adapter.getContent()).toBe(`[![image1971×1242 140 KB](${IMAGE_URL})](https://cdn.example.com/uploads/original/2X/f/cover.png)\n正文`);
  expect(importRemoteImageAttachment).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenLastCalledWith(`[![image1971×1242 140 KB](${IMAGE_URL})](https://cdn.example.com/uploads/original/2X/f/cover.png)\n正文`, { nodeId: 'node-1' });

  adapter.destroy();
});

it('skips remote download when the setting is turned off', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'false');
  const { adapter } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](https://example.com/cover.png)');
  await waitForLocalization();

  expect(adapter.getContent()).toBe('![Remote](https://example.com/cover.png)');
  expect(importRemoteImageAttachment).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();

  adapter.destroy();
});
