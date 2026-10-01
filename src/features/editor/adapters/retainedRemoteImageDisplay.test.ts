import { afterEach, expect, it } from 'vitest';

import {
  clearRetainedRemoteImageSources,
  getRetainedRemoteImageSource,
  recordDisplayedRemoteImageSource,
  retainDisplayedRemoteImageSources
} from './retainedRemoteImageDisplay';

const nodeId = 'remote-image-scheme-test';
const assetSource = `asset://${'a'.repeat(64)}.png`;

afterEach(() => clearRetainedRemoteImageSources(nodeId));

it.each([
  ['http://example.com/image.png', 'foliole-remote-image://image', true],
  ['https://example.com/image.png', 'foliole-remote-image://image', true],
  ['HTTP://example.com/image.png', 'foliole-remote-image://image', false],
  ['ftp://example.com/image.png', 'foliole-remote-image://image', false],
  ['https:example.com/image.png', 'foliole-remote-image://image', false],
  ['https://example.com/image.png', 'file:///image.png', false]
])('retains only supported remote image schemes: %s via %s', (source, renderUrl, accepted) => {
  const markdown = `![image](${source})`;
  recordDisplayedRemoteImageSource(nodeId, source, renderUrl);
  retainDisplayedRemoteImageSources(nodeId, markdown, [{
    from: 0,
    to: markdown.length,
    insert: `![image](${assetSource})`
  }]);
  expect(getRetainedRemoteImageSource(nodeId, assetSource)).toBe(accepted ? renderUrl : null);
});
