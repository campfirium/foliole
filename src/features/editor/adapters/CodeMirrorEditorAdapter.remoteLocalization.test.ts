import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

const { importRemoteImageAttachment } = vi.hoisted(() => ({
  importRemoteImageAttachment: vi.fn()
}));

vi.mock('../../../shared/platform/remoteImageLocalization', () => ({
  importRemoteImageAttachment
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

async function waitForLocalization() {
  await vi.advanceTimersByTimeAsync(220);
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
    attachment_id: 'hash-1',
    original_name: 'cover.png'
  });
  const { adapter, onChange } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](https://example.com/cover.png)');
  await waitForLocalization();

  expect(adapter.getContent()).toBe('![Remote](asset://hash-1.png)');
  expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/cover.png');
  expect(onChange).toHaveBeenLastCalledWith('![Remote](asset://hash-1.png)', { nodeId: 'node-1' });
  expect(window.confirm).not.toHaveBeenCalled();

  adapter.destroy();
});

it('rewrites remote markdown images when the setting is explicitly enabled', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'true');
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'hash-1',
    original_name: 'cover.png'
  });
  const { adapter } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](https://example.com/cover.png)');
  await waitForLocalization();

  expect(window.confirm).not.toHaveBeenCalled();
  expect(adapter.getContent()).toBe('![Remote](asset://hash-1.png)');

  adapter.destroy();
});

it('detects remote markdown images through the shared image parser before rewriting', async () => {
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported',
    attachment_id: 'hash-1',
    original_name: 'cover.png'
  });
  const { adapter } = createAdapter();

  adapter.setNodeId('node-1');
  adapter.replaceSelection('![Remote](<https://example.com/cover.png> "Title")');
  await waitForLocalization();

  expect(adapter.getContent()).toBe('![Remote](asset://hash-1.png "Title")');
  expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/cover.png');

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
