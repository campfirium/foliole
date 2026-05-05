import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { registerImageClozeEditorPresentation, unregisterImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

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
  expect(host.querySelector('.cm-md-image-cloze-overlay')).not.toBeNull();
}

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

function expectRemoteImageRendered(host: HTMLElement, source: string) {
  const image = host.querySelector('.cm-md-image-element');

  expect(image).not.toBeNull();
  expect(image?.getAttribute('src')).toBe(source);
  expect(resolveRuntimeAttachmentResource).not.toHaveBeenCalled();
}

async function expectUnavailableInternalImage(host: HTMLElement) {
  await waitFor(() => {
    const placeholder = host.querySelector('.cm-md-image-status[data-md-image-status="unavailable"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain('Image unavailable');
  });
}

function expectBlockAndInlineImageLayout(host: HTMLElement) {
  const widgets = Array.from(host.querySelectorAll('.cm-md-image-widget'));
  const images = Array.from(host.querySelectorAll('.cm-md-image-element'));

  expect(widgets[0]).toHaveAttribute('data-md-image-display', 'block');
  expect(widgets[1]).toHaveAttribute('data-md-image-display', 'inline');
  expect(images[0]).toHaveClass('cm-md-image-element-block');
  expect(images[1]).toHaveClass('cm-md-image-element-inline');
  expect(getComputedStyle(widgets[1] as HTMLElement).height).toBe('1lh');
}

async function expectImageStillRenderedOnSelection(host: HTMLElement, source: string) {
  await waitFor(() => {
    expect(host.querySelector('.cm-md-image-element')?.getAttribute('src')).toBe(source);
  });
}

function createOutlinedPresentation() {
  return {
    canCreate: true,
    focusRegionId: null,
    hiddenRegionIds: [],
    outlinedRegionIds: ['region-1'],
    regions: [
      {
        attachmentId: 'hash-1',
        height: 0.2,
        id: 'region-1',
        width: 0.3,
        x: 0.1,
        y: 0.2
      }
    ]
  };
}

async function expectOutlinedRegionRendered(host: HTMLElement) {
  await waitFor(() => {
    const region = host.querySelector('.cm-md-image-cloze-region[data-region-id="region-1"]');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('data-region-state', 'outlined');
  });
}

describe('live markdown image rendering basics', () => {
  beforeEach(() => {
    resolveRuntimeAttachmentResource.mockReset();
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
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

    await expectUnavailableInternalImage(host);

    adapter.destroy();
  });

  it('keeps remote markdown image rendering unchanged', () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/cover.png)');

    expectRemoteImageRendered(host, 'https://example.com/cover.png');

    adapter.destroy();
  });

  it('keeps remote image urls with parentheses intact', () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/gallery/(cover).png)');

    expectRemoteImageRendered(host, 'https://example.com/gallery/(cover).png');

    adapter.destroy();
  });

  it('renders standalone images as block widgets and inline images inside text flow', () => {
    const { adapter, host } = createAdapterHost(
      '![Block](https://example.com/block.png)\nText ![Inline](https://example.com/inline.png) tail'
    );

    expectBlockAndInlineImageLayout(host);

    adapter.destroy();
  });

  it('keeps image rendering stable when the cursor is on the image line', async () => {
    const source = 'https://example.com/focus.png';
    const { adapter, host } = createAdapterHost(`![Focus](${source})`);

    adapter.focus();
    adapter.setSelection({ from: 1, to: 1 });

    await expectImageStillRenderedOnSelection(host, source);
    expect(host.querySelector('.cm-content')?.textContent ?? '').not.toContain(`![Focus](${source})`);

    adapter.destroy();
  });
});

describe('live markdown image rendering image cloze presentation', () => {
  beforeEach(() => {
    resolveRuntimeAttachmentResource.mockReset();
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows outlined image cloze regions immediately after presentation refresh without requiring focus interaction', async () => {
    resolveRuntimeAttachmentResource.mockResolvedValue({
      status: 'ready',
      mime_type: 'image/png',
      resource_url: 'file:///tmp/cover.png'
    });

    const { adapter, host } = createAdapterHost('![Cover](asset://hash-1.png)');

    adapter.setNodeId('node-1');
    registerImageClozeEditorPresentation('node-1', createOutlinedPresentation());
    adapter.refreshImageClozePresentation();
    await expectOutlinedRegionRendered(host);

    unregisterImageClozeEditorPresentation('node-1');
    adapter.destroy();
  });
});
