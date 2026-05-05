import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('CodeMirrorEditorAdapter remote image localization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    importRemoteImageAttachment.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('rewrites remote markdown images after editor content changes', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      original_name: 'cover.png'
    });
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '',
      onChange
    });

    adapter.setNodeId('node-1');
    adapter.replaceSelection('![Remote](https://example.com/cover.png)');
    await waitForLocalization();

    expect(adapter.getContent()).toBe('![Remote](asset://hash-1.png)');
    expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/cover.png');
    expect(onChange).toHaveBeenLastCalledWith('![Remote](asset://hash-1.png)');

    adapter.destroy();
  });

  it('skips remote download when the setting is turned off', async () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'false');
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '',
      onChange: vi.fn()
    });

    adapter.setNodeId('node-1');
    adapter.replaceSelection('![Remote](https://example.com/cover.png)');
    await waitForLocalization();

    expect(adapter.getContent()).toBe('![Remote](https://example.com/cover.png)');
    expect(importRemoteImageAttachment).not.toHaveBeenCalled();

    adapter.destroy();
  });
});
