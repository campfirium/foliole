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

function description() {
  const hash = 'b'.repeat(64);
  return { attachmentId: 'resource', availability: 'cached', contentHash: hash, libraryScope: 'test-library',
    mimeType: 'application/pdf', originalName: 'resource.pdf', role: 'reference', storageKey: `${hash}.pdf` };
}

it('reuses unchanged catalog descriptions across refreshes and repopulates a cleared registry', () => {
  let visits = 0;
  const resource = description();
  const nodesById: Record<string, { attachments: unknown[] }> = { current: { attachments: [resource] } };
  for (let index = 0; index < 3000; index += 1) nodesById[`unrelated-${index}`] = {
    get attachments() { visits += 1; return []; }
  };
  const snapshot = { nodesById };
  registerWorkspaceAttachmentResources(snapshot);
  visits = 0;
  registerWorkspaceAttachmentResources(snapshot);
  registerWorkspaceAttachmentResources({ ...snapshot });
  clearAttachmentResourceDescriptions();
  registerWorkspaceAttachmentResources(snapshot);
  expect(listAttachmentResourceDescriptions()).toEqual([resource]);
  expect(visits).toBe(0);
});

it('registers new attachment and availability facts when the immutable catalog is replaced', () => {
  const resource = description();
  const original = { nodesById: { current: { attachments: [resource] } } };
  registerWorkspaceAttachmentResources(original);
  const updated = { ...resource, availability: 'remote_known' };
  const added = { ...resource, attachmentId: 'image', contentHash: 'c'.repeat(64),
    storageKey: `${'c'.repeat(64)}.png`, mimeType: 'image/png' };
  registerWorkspaceAttachmentResources({ nodesById: { current: { attachments: [updated, added] } } });
  expect(listAttachmentResourceDescriptions()).toEqual([updated, added]);
  clearAttachmentResourceDescriptions();
  registerWorkspaceAttachmentResources(original);
  expect(listAttachmentResourceDescriptions()).toEqual([resource]);
});
