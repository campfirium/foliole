import { expect, it } from 'vitest';

import { shouldCacheWorkspaceNodeDocument } from './workspaceNodeDocumentCache';

it('counts structured image sources toward the per-document budget', () => {
  expect(shouldCacheWorkspaceNodeDocument({
    content: 'Body',
    hideTitleHeading: false,
    imageSources: { cover: 'x'.repeat(200 * 1024) },
    kind: 'topic',
    reveal: null
  })).toBe(false);
});
