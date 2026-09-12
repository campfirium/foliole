import { beforeEach, expect, it } from 'vitest';

import {
  clearAttachmentResourceDescriptions,
  listAttachmentResourceDescriptions
} from '../../../lib/platform/attachmentResourceRegistry';

import { registerWorkspaceAttachmentResources } from './workspaceAttachmentResourceRegistry';

beforeEach(clearAttachmentResourceDescriptions);

it('registers only canonical attachment descriptions from a workspace snapshot', () => {
  const hash = 'a'.repeat(64);
  registerWorkspaceAttachmentResources({
    activeNodeId: 'node-1', nodeOrder: ['node-1'], trashedNodeIds: [], untitledSequenceByParent: {},
    nodesById: {
      'node-1': {
        anchorLink: null, content: '', createdAt: '', hideTitleHeading: false, id: 'node-1',
        isTitleManual: false, kind: 'topic', parentNodeId: null, reading: null, reveal: null,
        review: null, title: 'Topic', updatedAt: '',
        attachments: [{
          attachmentId: 'valid', availability: 'cached', contentHash: hash, libraryScope: 'ios-library',
          mimeType: 'application/pdf', originalName: 'paper.pdf', role: 'reference', storageKey: `${hash}.pdf`
        }, {
          attachmentId: 'legacy', availability: 'cached', contentHash: hash, libraryScope: 'ios-library',
          mimeType: 'application/pdf', originalName: null, role: 'reference', storageKey: 'attachments/legacy'
        }]
      }
    }
  });

  expect(listAttachmentResourceDescriptions()).toEqual([
    expect.objectContaining({ attachmentId: 'valid', storageKey: `${hash}.pdf` })
  ]);
});
