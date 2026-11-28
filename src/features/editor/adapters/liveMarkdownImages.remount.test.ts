import { waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({ invalidate: vi.fn(), resolve: vi.fn() }));

vi.mock('../../../shared/platform/attachmentResources', () => ({
  invalidateAttachmentResourceResolution: attachmentMock.invalidate,
  resolveRuntimeAttachmentResource: attachmentMock.resolve
}));

import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from './liveMarkdownImages';

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

function createWidget(hash: string) {
  const widget = createMarkdownImageWidgetDom({ alt: 'Long', attachmentId: hash,
    display: 'block', from: 0, source: `asset://${hash}.png`, to: 90 });
  document.body.append(widget);
  return widget;
}

async function loadOnce(hash: string) {
  attachmentMock.resolve.mockResolvedValue({
    status: 'ready', resource_url: `foliole-asset://attachment/${hash}.png`, mime_type: 'image/png'
  });
  const widget = createWidget(hash);
  await waitFor(() => expect(widget.querySelector('img')).not.toBeNull());
  const image = widget.querySelector('img')!;
  Object.defineProperties(image, { naturalHeight: { value: 6000 }, naturalWidth: { value: 800 } });
  image.dispatchEvent(new Event('load'));
  disposeMarkdownImageWidgetDom(widget);
  widget.remove();
}

it('remounts a loaded attachment at its known size without a loading placeholder', async () => {
  const hash = 'a'.repeat(64);
  await loadOnce(hash);

  const widget = createWidget(hash);
  const image = widget.querySelector('img');
  expect(widget.querySelector('[data-md-image-status]')).toBeNull();
  expect(widget.querySelector<HTMLElement>('.cm-md-image-surface')?.style.aspectRatio).toBe('800 / 6000');

  await waitFor(() => expect(attachmentMock.resolve).toHaveBeenCalledTimes(2));
  expect(widget.querySelector('img')).toBe(image);
  disposeMarkdownImageWidgetDom(widget);
});

it('still reports a remembered attachment whose file has since gone missing', async () => {
  const hash = 'b'.repeat(64);
  await loadOnce(hash);
  attachmentMock.resolve.mockResolvedValue({ status: 'missing_file', resource_url: null, mime_type: 'image/png' });

  const widget = createWidget(hash);

  await waitFor(() => expect(widget.querySelector('[data-md-image-status="unavailable"]')).not.toBeNull());
  disposeMarkdownImageWidgetDom(widget);
});
