import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { SelectionAnnotationPayload } from '../shared/selectionAnnotationActions';

import {
  createExpectedNewReview,
  createSnapshotWithScheduledItem
} from './companionSelectionAnnotationActions.test-support';

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

function createSnapshotWithHighlight(): WorkspaceSnapshot {
  const snapshot = createSnapshot();
  return {
    ...snapshot,
    nodeOrder: [...snapshot.nodeOrder, 'highlight-1'],
    nodesById: {
      ...snapshot.nodesById,
      'highlight-1': {
        anchorLink: {
          id: 'anchor-1',
          kind: 'highlight',
          locator: { from: 6, originalText: 'Beta', to: 10 }
        },
        content: 'Beta',
        createdAt: '2026-05-03T00:00:00.000Z',
        currentVersionId: 'desktop#highlight-v1',
        hideTitleHeading: false,
        id: 'highlight-1',
        isTitleManual: false,
        kind: 'topic',
        openingText: null,
        parentNodeId: 'parent',
        reading: null,
        reveal: null,
        review: null,
        title: 'Beta',
        updatedAt: '2026-05-03T00:00:00.000Z'
      }
    }
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

describe('companion new selection annotation actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists highlight annotations as Android node versions and updates the local snapshot', async () => {
    const { persistCompanionSelectionAnnotation } = await import('./companionSelectionAnnotationActions');

    const result = await persistCompanionSelectionAnnotation({
      deviceId: 'android-device',
      kind: 'highlight',
      payload: createPayload(),
      snapshot: createSnapshot()
    });

    expect(result?.nodeId).toBe('node-00000000-0000-4000-8000-000000000001');
    expect(result?.snapshot.nodesById['node-00000000-0000-4000-8000-000000000001']).toMatchObject({
      anchorLink: { id: 'anchor-1', kind: 'highlight' },
      content: 'Beta',
      kind: 'topic',
      parentNodeId: 'parent',
      title: 'Beta'
    });
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledWith([
      expect.objectContaining({
        host_name: 'android-device',
        object_id: 'node-00000000-0000-4000-8000-000000000001',
        version_id: 'ver_00000000-0000-4000-8000-000000000002'
      })
    ]);
    expect(syncObjectsMock.saveCompanionSyncNodeReviewRecord).not.toHaveBeenCalled();
  });

  it('persists cloze annotations with a review profile', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T08:00:00.000Z'));
    const { persistCompanionSelectionAnnotation } = await import('./companionSelectionAnnotationActions');

    const result = await persistCompanionSelectionAnnotation({
      deviceId: 'android-device',
      kind: 'cloze',
      payload: createPayload(),
      snapshot: createSnapshotWithScheduledItem(createSnapshot())
    });

    const expectedReview = createExpectedNewReview();

    expect(result?.snapshot.nodesById[result.nodeId]).toMatchObject({
      anchorLink: { id: 'anchor-1', kind: 'cloze' },
      content: 'Alpha [...] Gamma',
      kind: 'item',
      reveal: 'Beta',
      review: expectedReview
    });
    expect(syncObjectsMock.saveCompanionSyncNodeReviewRecord).toHaveBeenCalledWith({
      nodeId: result?.nodeId,
      review: expectedReview
    });
  });
});

describe('companion existing highlight annotation actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000004');
  });

  it('adds a note to an existing highlight through a node version', async () => {
    const { addNoteToCompanionExistingHighlight } = await import('./companionSelectionAnnotationActions');

    const result = await addNoteToCompanionExistingHighlight({
      deviceId: 'android-device',
      nodeId: 'highlight-1',
      note: 'Remember this',
      originalText: 'Beta',
      snapshot: createSnapshotWithHighlight()
    });

    expect(result?.snapshot.nodesById['highlight-1']).toMatchObject({
      content: 'Beta\n※ Remember this',
      currentVersionId: 'ver_00000000-0000-4000-8000-000000000003'
    });
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledWith([
      expect.objectContaining({
        object_id: 'highlight-1',
        parent_version_id: 'desktop#highlight-v1',
        version_id: 'ver_00000000-0000-4000-8000-000000000003'
      })
    ]);
  });

  it('deletes an existing highlight through a tombstone node version', async () => {
    const { deleteCompanionExistingHighlight } = await import('./companionSelectionAnnotationActions');

    const result = await deleteCompanionExistingHighlight({
      deviceId: 'android-device',
      nodeId: 'highlight-1',
      snapshot: createSnapshotWithHighlight()
    });

    expect(result?.snapshot.trashedNodeIds).toContain('highlight-1');
    expect(result?.snapshot.nodesById['highlight-1']!.deletedAt).toEqual(expect.any(String));
    expect(syncObjectsMock.applyCompanionSyncNodeVersions).toHaveBeenCalledWith([
      expect.objectContaining({
        object_id: 'highlight-1',
        parent_version_id: 'desktop#highlight-v1',
        snapshot: expect.objectContaining({ deleted_at: expect.any(String) }),
        version_id: 'ver_00000000-0000-4000-8000-000000000003'
      })
    ]);
  });
});
