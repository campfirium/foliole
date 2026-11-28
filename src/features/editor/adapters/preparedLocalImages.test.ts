import { afterEach, expect, it, vi } from 'vitest';

import { TEST_ATTACHMENT_ASSET_URL, TEST_ATTACHMENT_HASH } from '../../../test/attachmentResourceTestSupport';
import { collectImageMatches } from '../model/markdownImageMatches';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => async (_command: string, args: { storage_key?: string }) =>
    ({ status: 'ready', resource_url: `foliole-asset://attachment/${args.storage_key}`, mime_type: 'image/png' }))
}));

import { createMarkdownImageWidgetDom } from './liveMarkdownImages';
import { prepareLocalImages } from './preparedLocalImages';

const markdown = `![Cover](${TEST_ATTACHMENT_ASSET_URL})`;
const change = { from: 0, to: 0, insert: markdown };

function createWidget() {
  return createMarkdownImageWidgetDom(collectImageMatches(0, markdown)[0]!);
}

afterEach(() => {
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

it('mounts the decoded local image as soon as the replacing widget is created', async () => {
  const decoded: HTMLImageElement[] = [];
  HTMLImageElement.prototype.decode = function decode(this: HTMLImageElement) {
    decoded.push(this);
    return Promise.resolve();
  };
  const release = await prepareLocalImages([change]);

  const image = createWidget().querySelector('img');
  release();

  expect(image).toBe(decoded[0]);
  expect(image).toHaveAttribute('alt', 'Cover');
  expect(image?.getAttribute('src')).toContain(TEST_ATTACHMENT_HASH);
  expect(image).toHaveClass('cm-md-image-element');
});

it('drops a prepared image that no widget took and keeps the normal flow after a failed decode', async () => {
  HTMLImageElement.prototype.decode = () => Promise.resolve();
  (await prepareLocalImages([change]))();
  HTMLImageElement.prototype.decode = () => Promise.reject(new Error('decode failed'));
  await prepareLocalImages([change]);

  expect(createWidget().querySelector('img')).toBeNull();
});
