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

    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '![Cover](asset://hash-1.png)'
    });

    await waitFor(() => {
      const image = host.querySelector('.cm-md-image-element');
      expect(image).not.toBeNull();
      expect(image?.getAttribute('src')).toBe('file:///tmp/cover.png');
    });
    expect(resolveRuntimeAttachmentResource).toHaveBeenCalledWith('asset://hash-1.png');

    adapter.destroy();
  });

  it('shows an unavailable placeholder when an internal attachment is missing', async () => {
    resolveRuntimeAttachmentResource.mockResolvedValue({
      status: 'missing_file',
      mime_type: 'image/png',
      resource_url: null
    });

    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '![Cover](asset://hash-1.png)'
    });

    await waitFor(() => {
      const placeholder = host.querySelector('.cm-md-image-status[data-md-image-status="unavailable"]');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain('Image unavailable');
    });

    adapter.destroy();
  });

  it('keeps remote markdown image rendering unchanged', () => {
    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: '![Remote](https://example.com/cover.png)'
    });

    const image = host.querySelector('.cm-md-image-element');

    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('https://example.com/cover.png');
    expect(resolveRuntimeAttachmentResource).not.toHaveBeenCalled();

    adapter.destroy();
  });
});
