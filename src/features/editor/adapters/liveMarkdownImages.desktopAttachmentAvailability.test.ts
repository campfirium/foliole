import { waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({ invalidate: vi.fn(), resolve: vi.fn() }));

vi.mock('../../../shared/platform/attachmentResources', () => ({
  invalidateAttachmentResourceResolution: attachmentMock.invalidate,
  resolveRuntimeAttachmentResource: attachmentMock.resolve
}));

import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from './liveMarkdownImages';

afterEach(() => {
  for (const widget of document.querySelectorAll<HTMLElement>('.cm-md-image-widget')) disposeMarkdownImageWidgetDom(widget);
  vi.clearAllMocks();
  delete window.electronAPI;
  document.body.innerHTML = '';
});

it('shows a desktop image once the main process publishes its bytes after the image was unavailable', async () => {
  const available: Array<(storageKey: string) => void> = [];
  window.electronAPI = {
    onAttachmentResourceAvailable: (handler: (storageKey: string) => void) => {
      available.push(handler);
      return () => undefined;
    }
  } as unknown as NonNullable<typeof window.electronAPI>;
  const hash = 'f'.repeat(64);
  const key = `${hash}.png`;
  attachmentMock.resolve.mockResolvedValue({ status: 'not_found' });
  const widget = createMarkdownImageWidgetDom({ alt: 'Arrives later', attachmentId: hash,
    display: 'block', from: 0, source: `asset://${key}`, to: 90 });
  document.body.append(widget);
  await waitFor(() => expect(widget.querySelector('[data-md-image-status="unavailable"]')).not.toBeNull());

  attachmentMock.resolve.mockResolvedValue({ status: 'ready', resource_url: `foliole-asset://attachment/${key}`, mime_type: 'image/png' });
  for (const notify of available) notify(key);

  await waitFor(() => expect(widget.querySelector('.cm-md-image-element'))
    .toHaveAttribute('src', `foliole-asset://attachment/${key}`));
});
