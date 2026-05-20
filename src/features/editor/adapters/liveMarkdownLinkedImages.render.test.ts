import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

beforeEach(() => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
});

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

it('opens the wrapping link when clicking a linked image widget', async () => {
  const onOpenExternalLink = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, {
    initialContent: '[![Cover](asset://hash-1.png)](https://example.com/post)',
    onOpenExternalLink
  });

  await waitFor(() => {
    expect(host.querySelector('.cm-md-image-element')).not.toBeNull();
  });
  host.querySelector('.cm-md-image-element')?.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 320, clientY: 240 })
  );

  expect(onOpenExternalLink).toHaveBeenCalledWith({
    anchorPoint: { x: 320, y: 240 },
    href: 'https://example.com/post'
  });

  adapter.destroy();
});

it('opens the wrapping link when the linked image has spacing and caption text', async () => {
  const onOpenExternalLink = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, {
    initialContent: '[\n\n![image](asset://hash-1.png)\n\nimage1971×1242 140 KB](https://example.com/post)',
    onOpenExternalLink
  });

  await waitFor(() => {
    expect(host.querySelector('.cm-md-image-element')).not.toBeNull();
  });
  host.querySelector('.cm-md-image-element')?.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 120 })
  );

  expect(onOpenExternalLink).toHaveBeenCalledWith({
    anchorPoint: { x: 100, y: 120 },
    href: 'https://example.com/post'
  });

  adapter.destroy();
});
