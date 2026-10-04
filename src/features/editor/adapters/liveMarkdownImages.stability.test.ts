import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  registerTestAttachmentResource,
  TEST_ATTACHMENT_ASSET_URL,
  TEST_ATTACHMENT_HASH
} from '../../../test/attachmentResourceTestSupport';
import { registerImageClozeEditorPresentation, unregisterImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import {
  cancelImageExcerptRegionSelection,
  isImageExcerptRegionSelectionActive,
  requestImageExcerptRegionSelection
} from '../model/imageExcerptRegionSelection';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => async (command: string, args: { storage_key?: string }) =>
    command === 'resolve_attachment_resource'
      ? { status: 'ready', resource_url: `foliole-asset://attachment/${args.storage_key}`, mime_type: 'image/png' }
      : { intrinsic_size: null })
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

beforeEach(() => {
  registerTestAttachmentResource();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
});

afterEach(() => {
  cancelImageExcerptRegionSelection();
  unregisterImageClozeEditorPresentation('node-1');
  document.body.innerHTML = '';
});

describe('live markdown image widget stability', () => {
  it('keeps image widget DOM when typing before an unchanged image', async () => {
    const initialContent = `Lead\n\n![Cover](${TEST_ATTACHMENT_ASSET_URL})\n\nTail`;
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

  it('keeps a loaded image while adding and removing its highlight', async () => {
    const { adapter, host } = createAdapterHost(`Lead\n\n![Cover](${TEST_ATTACHMENT_ASSET_URL})\n\nTail`);
    adapter.setNodeId('node-1');
    await waitFor(() => expect(host.querySelector('.cm-md-image-element')).not.toBeNull());
    const image = host.querySelector('.cm-md-image-element');
    const widget = host.querySelector('.cm-md-image-widget');
    const scrollDOM = host.querySelector<HTMLElement>('.cm-scroller')!;
    scrollDOM.scrollTop = 320;
    expect(requestImageExcerptRegionSelection('node-1')).toBe(true);

    registerImageClozeEditorPresentation('node-1', {
      canCreate: true,
      focusRegionId: null,
      hiddenRegionIds: [],
      outlinedRegionIds: ['region-full'],
      regions: [{ attachmentId: TEST_ATTACHMENT_HASH, height: 1, id: 'region-full', width: 1, x: 0, y: 0 }]
    });
    adapter.refreshImageClozePresentation();
    await waitFor(() => expect(host.querySelector('.cm-md-image-surface')).toHaveAttribute('data-md-image-highlighted', 'true'));
    expect(host.querySelector('.cm-md-image-element')).toBe(image);
    expect(host.querySelector('.cm-md-image-widget')).toBe(widget);
    expect(scrollDOM.scrollTop).toBe(320);
    expect(isImageExcerptRegionSelectionActive('node-1')).toBe(true);

    unregisterImageClozeEditorPresentation('node-1');
    adapter.refreshImageClozePresentation();
    await waitFor(() => expect(host.querySelector('.cm-md-image-surface')).toHaveAttribute('data-md-image-highlighted', 'false'));
    expect(host.querySelector('.cm-md-image-element')).toBe(image);
    expect(host.querySelector('.cm-md-image-widget')).toBe(widget);
    expect(scrollDOM.scrollTop).toBe(320);
    expect(isImageExcerptRegionSelectionActive('node-1')).toBe(true);
    adapter.destroy();
  });
});

describe('annotation updates', () => {
  it('keeps the image and scroll position while toggling a text highlight', async () => {
    const { adapter, host } = createAdapterHost(`Lead\n\n![Cover](${TEST_ATTACHMENT_ASSET_URL})\n\nTail`);
    adapter.setNodeId('node-1');
    await waitFor(() => expect(host.querySelector('.cm-md-image-element')).not.toBeNull());
    const image = host.querySelector('.cm-md-image-element');
    const scrollDOM = host.querySelector<HTMLElement>('.cm-scroller')!;
    scrollDOM.scrollTop = 320;

    adapter.setTextAnchorDecorations([{ from: 0, kind: 'highlight', nodeId: 'highlight-1', to: 4 }]);
    expect(host.querySelector('.cm-md-image-element')).toBe(image);
    expect(scrollDOM.scrollTop).toBe(320);
    adapter.setTextAnchorDecorations([]);
    expect(host.querySelector('.cm-md-image-element')).toBe(image);
    expect(scrollDOM.scrollTop).toBe(320);
    adapter.destroy();
  });
});
