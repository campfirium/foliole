import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveRuntimeAttachmentResource = vi.fn();

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

vi.mock('../../../shared/platform/attachmentResources', () => ({
  resolveRuntimeAttachmentResource: (resourceUrl: string) => resolveRuntimeAttachmentResource(resourceUrl)
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

async function expectInternalImageRendered(host: HTMLElement) {
  await waitFor(() => {
    const image = host.querySelector('.cm-md-image-element');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('file:///tmp/cover.png');
  });
  const widget = host.querySelector('.cm-md-image-widget');
  expect(widget).toHaveAttribute('data-md-image-attachment-id', 'hash-1');
  expect(widget).toHaveAttribute('data-md-image-from');
  expect(widget).toHaveAttribute('data-md-image-to');
}

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

describe('live markdown image rendering', () => {
  beforeEach(() => {
    resolveRuntimeAttachmentResource.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders internal attachment images through the unified resource entry', async () => {
    resolveRuntimeAttachmentResource.mockResolvedValue({
      status: 'ready',
      mime_type: 'image/png',
      resource_url: 'file:///tmp/cover.png'
    });

    const { adapter, host } = createAdapterHost('![Cover](asset://hash-1.png)');

    await expectInternalImageRendered(host);
    expect(resolveRuntimeAttachmentResource).toHaveBeenCalledWith('asset://hash-1.png');

    adapter.destroy();
  });

  it('shows an unavailable placeholder when an internal attachment is missing', async () => {
    resolveRuntimeAttachmentResource.mockResolvedValue({
      status: 'missing_file',
      mime_type: 'image/png',
      resource_url: null
    });

    const { adapter, host } = createAdapterHost('![Cover](asset://hash-1.png)');

    await waitFor(() => {
      const placeholder = host.querySelector('.cm-md-image-status[data-md-image-status="unavailable"]');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain('Image unavailable');
    });

    adapter.destroy();
  });

  it('keeps remote markdown image rendering unchanged', () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/cover.png)');

    const image = host.querySelector('.cm-md-image-element');

    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('https://example.com/cover.png');
    expect(resolveRuntimeAttachmentResource).not.toHaveBeenCalled();

    adapter.destroy();
  });

  it('renders standalone images as block widgets and inline images inside text flow', () => {
    const { adapter, host } = createAdapterHost(
      '![Block](https://example.com/block.png)\nText ![Inline](https://example.com/inline.png) tail'
    );

    const widgets = Array.from(host.querySelectorAll('.cm-md-image-widget'));

    expect(widgets[0]).toHaveAttribute('data-md-image-display', 'block');
    expect(widgets[1]).toHaveAttribute('data-md-image-display', 'inline');

    adapter.destroy();
  });
});
