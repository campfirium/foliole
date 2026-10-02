import { waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { TEST_ATTACHMENT_ASSET_URL } from '../../../test/attachmentResourceTestSupport';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => async (_command: string, args: { storage_key?: string }) => ({
    status: 'ready', resource_url: `foliole-asset://attachment/${args.storage_key}`, mime_type: 'image/png'
  }))
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

afterEach(() => { document.body.innerHTML = ''; });

async function loadImage(host: HTMLElement, width: number, height: number) {
  await waitFor(() => expect(host.querySelector('.cm-md-image-element')).not.toBeNull());
  const image = host.querySelector<HTMLImageElement>('.cm-md-image-element')!;
  Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } });
  image.dispatchEvent(new Event('load'));
  return image;
}

it('renders a large local attachment beside its caption as a block on opening and reopening', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  const content = `![Infographic](${TEST_ATTACHMENT_ASSET_URL})Infographic caption\nFollowing paragraph`;
  for (let opening = 0; opening < 2; opening += 1) {
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });
    try {
      const image = await loadImage(host, 2752, 1536);
      expect(image.closest('.cm-md-image-widget')).toHaveAttribute('data-md-image-display', 'block');
      expect(image).toHaveClass('cm-md-image-element-block');
      expect(host.querySelector('.cm-content')).toHaveTextContent('Infographic caption');
      expect(adapter.getContent()).toBe(content);
    } finally {
      adapter.destroy();
      host.remove();
    }
  }
});

it('keeps a small local image inline after it loads', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, {
    initialContent: `Text ![Icon](${TEST_ATTACHMENT_ASSET_URL}) caption`
  });
  try {
    const image = await loadImage(host, 64, 64);
    expect(image.closest('.cm-md-image-widget')).toHaveAttribute('data-md-image-display', 'inline');
    expect(image).toHaveClass('cm-md-image-element-inline');
  } finally {
    adapter.destroy();
  }
});
