import { expect, it } from 'vitest';

import { toWorkspaceNodeDocument } from './workspaceNodeDocumentCache';
import { createInitialWorkspaceState } from './workspaceStore';

it('keeps cleared image regions as null in cached node documents', () => {
  const seedNode = createInitialWorkspaceState(new Date('2026-04-10T00:00:00.000Z')).nodesById['node-1'];
  const document = toWorkspaceNodeDocument({
    ...seedNode,
    kind: 'topic',
    content: '![Cover](asset://hash-1.png)',
    imageRegions: null
  });

  expect(document.imageRegions).toBeNull();
});
