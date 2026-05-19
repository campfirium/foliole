import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

describe('live markdown image widget stability', () => {
  beforeEach(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps image widget DOM when typing before an unchanged image', async () => {
    const initialContent = 'Lead\n\n![Cover](asset://hash-1.png)\n\nTail';
    const { adapter, host } = createAdapterHost(initialContent);

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-element')).not.toBeNull();
    });
    const widget = host.querySelector('.cm-md-image-widget');
    const image = host.querySelector('.cm-md-image-element');
    expect(widget).not.toBeNull();
    expect(image).not.toBeNull();

    adapter.replaceRange(0, 0, 'X');

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-widget')).toBe(widget);
      expect(host.querySelector('.cm-md-image-element')).toBe(image);
    });
    expect(widget).toHaveAttribute('data-md-image-from', String(initialContent.indexOf('![Cover') + 1));

    adapter.destroy();
  });
});
