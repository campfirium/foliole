// @vitest-environment node

import { expect, it } from 'vitest';

import { buildRepairBodies } from '../../../scripts/oneoff/readwise-epub-structure-repair-bodies.js';

it('refreshes changed source bodies while preserving the localized root image', () => {
  const result = buildRepairBodies({
    contentById: new Map(),
    desired: [{
      content: '# Chapter\n\nNew body', key: 'chapter', nodeId: 'node-epub-chapter',
      parentKey: null, title: 'Chapter'
    }],
    documentId: 'book-1',
    oldGenerated: [{
      content: '# Chapter\n\nOld body', id: 'node-epub-chapter', is_title_manual: 1,
      parent_id: 'root', title: 'Chapter'
    }],
    root: {
      content: '## Book\n\n![Cover](asset://cover.jpg)\n\nOld front', id: 'root',
      is_title_manual: 1, parent_id: null, title: 'Book'
    },
    structure: {
      degradedReason: null, imageCount: 1,
      legacyRootBody: '![Cover](https://reader.example/cover.jpg)\n\nNew front',
      legacySections: [{ content: '# Chapter\n\nNew body', markerKey: 'chapter' }],
      markerCount: 1,
      rootBody: '![Cover](https://reader.example/cover.jpg)\n\nNew front',
      sections: [{ content: '# Chapter\n\nNew body', headingLevel: 1, markerKey: 'chapter', title: 'Chapter' }]
    }
  });

  expect(result.sourceChanged).toBe(true);
  expect(result.newCoverageHash).toBe(result.sourceCoverageHash);
  expect(result.bodies[0]?.content).toContain('![Cover](asset://cover.jpg)');
  expect(result.bodies[0]?.content).toContain('New front');
  expect(result.bodies[1]?.content).toBe('# Chapter\n\nNew body');
});
