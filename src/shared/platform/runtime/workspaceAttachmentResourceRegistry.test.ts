import { beforeEach, expect, it } from 'vitest';

import {
  clearAttachmentResourceDescriptions,
  listAttachmentResourceDescriptions
} from '../../../../lib/platform/attachmentResourceRegistry';

import { registerWorkspaceAttachmentResources } from './workspaceAttachmentResourceRegistry';

beforeEach(clearAttachmentResourceDescriptions);

it('registers only canonical attachment descriptions from a workspace snapshot', () => {
  const hash = 'a'.repeat(64);
  registerWorkspaceAttachmentResources({
    nodesById: {
      'node-1': {
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
