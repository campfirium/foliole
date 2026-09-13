import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { requestImageExcerptRegionSelection } from '../model/imageExcerptRegionSelection';

const { importRemoteImageAttachment } = vi.hoisted(() => ({ importRemoteImageAttachment: vi.fn() }));

vi.mock('../../../shared/platform/remoteImageLocalization', () => ({
  importRemoteImageAttachment: async (...args: unknown[]) => {
    const result = await importRemoteImageAttachment(...args);
    return result?.status === 'imported' && !result.storage_key
      ? { ...result, storage_key: `${result.hash}.png` }
      : result;
  }
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const IMAGE_HASH = 'a'.repeat(64);
const IMAGE_URL = `asset://${IMAGE_HASH}.png`;

function createAdapter() {
  const host = document.createElement('div');
  document.body.append(host);
  const onChange = vi.fn();
  return { adapter: new CodeMirrorEditorAdapter(host, { initialContent: '', onChange }), onChange };
}

async function targetSurface(index = 0) {
  const surfaces = document.querySelectorAll<HTMLElement>('.cm-md-image-surface');
  surfaces[index]?.dispatchEvent(new Event('mousemove'));
  await vi.advanceTimersByTimeAsync(20);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'false');
  importRemoteImageAttachment.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

it('localizes only the remote image targeted for an excerpt', async () => {
  importRemoteImageAttachment.mockResolvedValue({
    status: 'imported', attachment_id: 'attachment-1', hash: IMAGE_HASH,
    mime_type: 'image/png', original_name: 'cover.png'
  });
  const { adapter, onChange } = createAdapter();
  const first = '![First](https://example.com/first.png)';
  adapter.setNodeId('node-1');
  adapter.setContent(`${first}\n![Second](https://example.com/second.png)`);

  expect(requestImageExcerptRegionSelection('node-1')).toBe(true);
  await targetSurface(1);
  await vi.advanceTimersByTimeAsync(20);

  expect(adapter.getContent()).toBe(`${first}\n![Second](${IMAGE_URL})`);
  expect(importRemoteImageAttachment).toHaveBeenCalledOnce();
  expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/second.png');
  expect(onChange).toHaveBeenLastCalledWith(`${first}\n![Second](${IMAGE_URL})`, { nodeId: 'node-1' });
  const localizedSurface = document.querySelector<HTMLElement>(
    `[data-md-image-attachment-id="${IMAGE_HASH}"] .cm-md-image-surface`
  );
  expect(localizedSurface).not.toBeNull();
  expect(localizedSurface?.dataset.mdImageExcerptActive).toBe('true');
  expect(requestImageExcerptRegionSelection('node-1')).toBe(true);
  adapter.destroy();
});

it('does not change content when targeted localization fails', async () => {
  importRemoteImageAttachment.mockResolvedValue({ status: 'error', error_code: 'download_failed' });
  const { adapter, onChange } = createAdapter();
  const content = '![Remote](https://example.com/cover.png)';
  adapter.setNodeId('node-1');
  adapter.setContent(content);

  expect(requestImageExcerptRegionSelection('node-1')).toBe(true);
  await targetSurface();

  expect(adapter.getContent()).toBe(content);
  expect(onChange).not.toHaveBeenCalled();
  adapter.destroy();
});

it('does not localize when a palette disappears over a stationary remote image', async () => {
  const { adapter } = createAdapter();
  const content = '![Remote](https://example.com/cover.png)';
  adapter.setNodeId('node-1');
  adapter.setContent(content);

  expect(requestImageExcerptRegionSelection('node-1')).toBe(true);
  document.querySelector<HTMLElement>('.cm-md-image-surface')?.dispatchEvent(new Event('pointerenter'));
  await vi.advanceTimersByTimeAsync(20);

  expect(adapter.getContent()).toBe(content);
  expect(importRemoteImageAttachment).not.toHaveBeenCalled();
  adapter.destroy();
});

it('discards a targeted result after editor content changes', async () => {
  let resolveImport: ((value: unknown) => void) | undefined;
  importRemoteImageAttachment.mockReturnValue(new Promise((resolve) => { resolveImport = resolve; }));
  const { adapter, onChange } = createAdapter();
  adapter.setNodeId('node-1');
  adapter.setContent('![Remote](https://example.com/cover.png)');
  expect(requestImageExcerptRegionSelection('node-1')).toBe(true);
  document.querySelector<HTMLElement>('.cm-md-image-surface')?.dispatchEvent(new Event('mousemove'));
  adapter.setContent('Replacement');

  resolveImport?.({
    status: 'imported', attachment_id: 'attachment-1', hash: IMAGE_HASH,
    mime_type: 'image/png', original_name: 'cover.png'
  });
  await vi.advanceTimersByTimeAsync(0);

  expect(adapter.getContent()).toBe('Replacement');
  expect(onChange).not.toHaveBeenCalled();
  adapter.destroy();
});

it('ignores repeated targeting and a result that arrives after switching nodes', async () => {
  let resolveImport: ((value: unknown) => void) | undefined;
  importRemoteImageAttachment.mockReturnValue(new Promise((resolve) => { resolveImport = resolve; }));
  const { adapter, onChange } = createAdapter();
  adapter.setNodeId('node-1');
  adapter.setContent('![Remote](https://example.com/cover.png)');
  expect(requestImageExcerptRegionSelection('node-1')).toBe(true);
  const surface = document.querySelector<HTMLElement>('.cm-md-image-surface');
  surface?.dispatchEvent(new Event('mousemove'));
  surface?.dispatchEvent(new Event('pointerdown'));
  expect(importRemoteImageAttachment).toHaveBeenCalledOnce();
  adapter.setNodeId('node-2');

  resolveImport?.({
    status: 'imported', attachment_id: 'attachment-1', hash: IMAGE_HASH,
    mime_type: 'image/png', original_name: 'cover.png'
  });
  await vi.advanceTimersByTimeAsync(0);

  expect(adapter.getContent()).toBe('![Remote](https://example.com/cover.png)');
  expect(onChange).not.toHaveBeenCalled();
  adapter.destroy();
});
