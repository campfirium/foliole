// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { persistCreatedNodeImageAttachment } from '../attachments/persistCreatedNodeImageAttachment.js';
import { upsertVersionedNodeSnapshotWithOrder } from '../database/nodeVersionedMutations.js';

import { handleStoragePdfImageExcerptCommand } from './storagePdfImageExcerptCommand.js';

vi.mock('../attachments/persistCreatedNodeImageAttachment.js', () => ({
  persistCreatedNodeImageAttachment: vi.fn(async (args: { expectedHash: string; persistNode: () => void }) => {
    args.persistNode();
    return args.expectedHash;
  })
}));
vi.mock('../database/nodeVersionedMutations.js', () => ({ upsertVersionedNodeSnapshotWithOrder: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it('creates a PDF image excerpt through the existing node persistence owner', async () => {
  const attachmentId = 'a'.repeat(64);
  const result = await handleStoragePdfImageExcerptCommand('create_pdf_image_excerpt', {
    activeNodeId: 'pdf-1', attachmentId, bytesBase64: 'iVBORw0KGgo=',
    nodeId: 'excerpt-1', nodeOrder: ['pdf-1', 'excerpt-1'], parentNodeId: 'pdf-1', kind: 'topic',
    title: 'Image excerpt · Page 1', isTitleManual: false,
    content: `![Image excerpt](asset://${attachmentId}.png)`, reveal: null,
    anchorLink: { id: 'anchor-1', kind: 'image-excerpt', locator: {
      page: 1, x: 0, y: 0, rects: [{ x: 0, y: 0, width: 1, height: 1 }]
    } },
    position: 1, createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z'
  }, null);

  expect(result).toMatchObject({ createdNodeIds: ['excerpt-1'], nodeOrder: ['pdf-1', 'excerpt-1'] });
  expect(persistCreatedNodeImageAttachment).toHaveBeenCalledWith(expect.objectContaining({
    expectedHash: attachmentId, nodeId: 'excerpt-1', persistNode: expect.any(Function)
  }));
  expect(upsertVersionedNodeSnapshotWithOrder).toHaveBeenCalledWith(
    expect.objectContaining({ nodeId: 'excerpt-1', anchorLink: expect.objectContaining({ kind: 'image-excerpt' }) }),
    ['pdf-1', 'excerpt-1']
  );
});
