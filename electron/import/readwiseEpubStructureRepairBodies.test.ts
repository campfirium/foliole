// @vitest-environment node

import { expect, it } from 'vitest';

import { buildRepairBodies } from '../../scripts/oneoff/readwise-epub-structure-repair-bodies.js';

it('keeps the root cover separate from localized EPUB body images', () => {
  const result = buildRepairBodies({
    contentById: new Map([['root', []]]), desired: [], documentId: 'document-1', oldGenerated: [],
    root: {
      content: [
        '# Book', '![Book cover](asset://cover.jpg)', 'Old body',
        '![Body](asset://body.jpg)', '[Open in Reader](https://readwise.io/read/1)'
      ].join('\n\n'),
      id: 'root', is_title_manual: 1, parent_id: null, title: 'Book'
    },
    structure: {
      degradedReason: null, imageCount: 1,
      legacyRootBody: 'New body\n\n![Body](https://cdn.example.com/body.jpg)',
      markerCount: 0,
      rootBody: 'New body\n\n![Body](https://cdn.example.com/body.jpg)', sections: []
    }
  });

  expect(result.bodies[0]?.content).toBe([
    '# Book', '![Book cover](asset://cover.jpg)', 'New body',
    '![Body](asset://body.jpg)', '[Open in Reader](https://readwise.io/read/1)'
  ].join('\n\n'));
});
