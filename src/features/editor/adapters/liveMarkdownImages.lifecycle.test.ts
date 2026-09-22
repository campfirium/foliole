import { waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({
  resolve: vi.fn(async () => ({
    mime_type: 'image/png',
    resource_url: `foliole-asset://attachment/${'a'.repeat(64)}.png`,
    status: 'ready'
  }))
}));

vi.mock('../../../shared/platform/attachmentResources', () => ({
  invalidateAttachmentResourceResolution: vi.fn(),
  resolveRuntimeAttachmentResource: attachmentMock.resolve
}));

import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from './liveMarkdownImages';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('does not run the delayed attachment retry after the widget is disposed', async () => {
  const hash = 'a'.repeat(64);
  const widget = createMarkdownImageWidgetDom({
    alt: 'Attachment', attachmentId: hash, display: 'block', from: 0,
    source: `asset://${hash}.png`, to: 80
  });
  await waitFor(() => expect(widget.querySelector('.cm-md-image-element')).not.toBeNull());
  const image = widget.querySelector<HTMLImageElement>('.cm-md-image-element')!;
  vi.useFakeTimers();

  image.dispatchEvent(new Event('error'));
  disposeMarkdownImageWidgetDom(widget);
  vi.advanceTimersByTime(250);

  expect(new URL(image.src).searchParams.get('retry')).toBeNull();
});
