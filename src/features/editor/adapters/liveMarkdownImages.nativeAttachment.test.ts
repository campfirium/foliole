import { waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({
  invalidate: vi.fn(),
  resolve: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'ios'),
    isNativePlatform: vi.fn(() => true)
  },
  registerPlugin: vi.fn(() => ({}))
}));

vi.mock('../../../shared/platform/attachmentResources', () => ({
  invalidateAttachmentResourceResolution: attachmentMock.invalidate,
  resolveRuntimeAttachmentResource: attachmentMock.resolve
}));

import { createMarkdownImageWidgetDom } from './liveMarkdownImages';

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

it('resolves iOS attachment images through the shared native resource capability', async () => {
  attachmentMock.resolve.mockResolvedValue({
    mime_type: 'image/png',
    resource_url: 'capacitor://localhost/_capacitor_file_/attachments/hash-ios',
    status: 'ready'
  });

  const widget = createMarkdownImageWidgetDom({
    alt: 'iOS attachment',
    attachmentId: 'hash-ios',
    display: 'block',
    from: 0,
    source: 'asset://hash-ios.png',
    to: 31
  });
  document.body.append(widget);

  await waitFor(() => {
    expect(widget.querySelector('.cm-md-image-element')).toHaveAttribute(
      'src',
      'capacitor://localhost/_capacitor_file_/attachments/hash-ios'
    );
  });
  expect(attachmentMock.resolve).toHaveBeenCalledWith('asset://hash-ios.png');
});
