import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { SelectionAnnotationPayload } from '../shared/selectionAnnotationActions';

const syncObjectsMock = vi.hoisted(() => ({
  applyCompanionSyncNodeVersions: vi.fn(async () => ['node-created']),
  saveCompanionSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'review-hash', object_id: 'node-created' }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

function createSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: 'parent',
    nodeOrder: ['parent'],
    nodesById: {
      parent: {
        anchorLink: null,
        content: 'Alpha Beta Gamma',
        createdAt: '2026-05-03T00:00:00.000Z',
        hideTitleHeading: false,
        id: 'parent',
        isTitleManual: false,
        kind: 'topic',
        openingText: null,
        parentNodeId: null,
        reading: null,
        reveal: null,
        review: null,
        title: 'Parent',
        updatedAt: '2026-05-03T00:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function createPayload(): SelectionAnnotationPayload {
  return {
    anchorId: 'anchor-1',
    clozeContent: 'Alpha [...] Gamma',
    entries: [{ locator: { from: 6, originalText: 'Beta', to: 10 } }],
    parentNodeId: 'parent',
    selectionText: 'Beta'
  };
}

describe('companion selection annotation write boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000020')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000021');
  });

  it('persists note annotations as Android node versions without changing the parent body', async () => {
    const { persistCompanionSelectionAnnotation } = await import('./companionSelectionAnnotationActions');

    const result = await persistCompanionSelectionAnnotation({
      deviceId: 'android-device',
      kind: 'note',
      note: 'Remember this',
      payload: createPayload(),
      snapshot: createSnapshot()
    });

    expect(result?.snapshot.nodesById[result.nodeId]).toMatchObject({
      anchorLink: { id: 'anchor-1', kind: 'highlight' },
      content: 'Beta\n※ Remember this',
      kind: 'topic',
      parentNodeId: 'parent'
    });
    expect(result?.snapshot.nodesById.parent?.content).toBe('Alpha Beta Gamma');
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledWith([
      expect.objectContaining({
        device_id: 'android-device',
        object_id: result?.nodeId
      })
    ]);
    expect(syncObjectsMock.saveCompanionSyncNodeReviewRecord).not.toHaveBeenCalled();
  });

  it('does not write when the annotation parent is missing or trashed', async () => {
    const { persistCompanionSelectionAnnotation } = await import('./companionSelectionAnnotationActions');
    const missingParentSnapshot = createSnapshot();
    delete missingParentSnapshot.nodesById.parent;

    await expect(persistCompanionSelectionAnnotation({
      deviceId: 'android-device',
      kind: 'note',
      note: 'Remember this',
      payload: createPayload(),
      snapshot: missingParentSnapshot
    })).resolves.toBeNull();
    await expect(persistCompanionSelectionAnnotation({
      deviceId: 'android-device',
      kind: 'cloze',
      payload: createPayload(),
      snapshot: { ...createSnapshot(), trashedNodeIds: ['parent'] }
    })).resolves.toBeNull();
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).not.toHaveBeenCalled();
    expect(syncObjectsMock.saveCompanionSyncNodeReviewRecord).not.toHaveBeenCalled();
  });
});
