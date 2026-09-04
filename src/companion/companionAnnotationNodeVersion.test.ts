import { expect, it, vi } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';

import {
  canonicalCompanionNodePayload,
  toCompanionNativeNodeVersion
} from './companionAnnotationNodeVersion';

function folderNode(): WorkspaceNodeSnapshot {
  return {
    anchorLink: null,
    attachments: [
      { attachmentId: 'attachment-b', mimeType: null, originalName: null, role: 'reference' },
      { attachmentId: 'attachment-a', mimeType: null, originalName: null, role: 'cover' }
    ],
    content: 'Folder body',
    createdAt: '2026-07-11T00:00:00.000Z',
    currentVersionId: 'desktop#base',
    desiredRetention: 0.8,
    enableShortTerm: false,
    hideTitleHeading: false,
    id: 'folder-1',
    importContentFingerprint: 'content-a',
    importSourceFingerprint: 'source-a',
    isTitleManual: true,
    kind: 'folder',
    manualChildOrder: ['child-b', 'child-a'],
    openingText: null,
    parentNodeId: null,
    position: 37,
    priority: 4,
    reading: null,
    reveal: null,
    review: null,
    sequentialReadingEnabled: true,
    shelvedAt: '2026-07-10T00:00:00.000Z',
    title: 'Folder',
    updatedAt: '2026-07-11T01:00:00.000Z'
  };
}

it('builds the complete canonical payload from authoritative workspace fields', () => {
  expect(canonicalCompanionNodePayload(folderNode())).toMatchObject({
    attachments: [
      { attachment_id: 'attachment-a', role: 'cover' },
      { attachment_id: 'attachment-b', role: 'reference' }
    ],
    manual_child_order: '["child-b","child-a"]',
    import_content_fingerprint: 'content-a',
    import_source_fingerprint: 'source-a',
    position: 37,
    sequential_reading_enabled: true,
    shelved_at: '2026-07-10T00:00:00.000Z'
  });
});

it('uses one canonical payload for the version snapshot and desktop-compatible hash', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  const node = folderNode();
  const version = await toCompanionNativeNodeVersion(node, 'android-device');

  expect(version.snapshot).toEqual(canonicalCompanionNodePayload(node));
  expect(version.content_hash).toBe(computeNodeSyncHash({
    anchorLink: null,
    attachments: node.attachments!.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      role: attachment.role
    })),
    content: node.content,
    createdAt: node.createdAt,
    deletedAt: null,
    desiredRetention: node.desiredRetention ?? null,
    enableShortTerm: node.enableShortTerm ?? null,
    sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
    shelvedAt: node.shelvedAt ?? null,
    manualChildOrder: JSON.stringify(node.manualChildOrder),
    hideTitleHeading: node.hideTitleHeading,
    id: node.id,
    imageRegions: null,
    importContentFingerprint: node.importContentFingerprint ?? null,
    importSourceFingerprint: node.importSourceFingerprint ?? null,
    isTitleManual: node.isTitleManual,
    kind: node.kind,
    openingText: null,
    parentId: null,
    position: node.position ?? null,
    priority: node.priority ?? null,
    reveal: null,
    title: node.title,
    updatedAt: node.updatedAt,
    virtualFilter: null
  }));
});

it('creates a mobile-safe version id when the WebView lacks randomUUID', async () => {
  const originalRandomUUID = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  try {
    await expect(toCompanionNativeNodeVersion(folderNode(), 'ios-device'))
      .resolves.toMatchObject({ version_id: expect.stringMatching(/^ver_[0-9a-f-]{36}$/) });
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: originalRandomUUID });
  }
});

it('keeps canonical empty relations explicit for new non-folder nodes', () => {
  const node = folderNode();
  delete node.attachments;
  delete node.manualChildOrder;
  delete node.position;
  node.kind = 'topic';
  const payload = canonicalCompanionNodePayload(node);

  expect(payload.attachments).toEqual([]);
  expect(payload.manual_child_order).toBeNull();
  expect(payload.position).toBeNull();
});

it('fails instead of persisting a non-SHA fallback hash', async () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto', { getRandomValues });
  try {
    await expect(toCompanionNativeNodeVersion(folderNode(), 'android-device'))
      .rejects.toThrow('sync_node_version_hash_unavailable');
  } finally {
    vi.unstubAllGlobals();
  }
});
