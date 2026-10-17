import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { createSyncFromZeroDataset } from './sync-from-zero-dataset-action.mjs';

it('creates every bounded fixture only through registered desktop product commands', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-from-zero-dataset-'));
  const attachmentBytes = [];
  const invoke = vi.fn(async (command, args) => {
    if (command === 'load_workspace_list_snapshot') return { nodeOrder: ['special-inbox'] };
    if (command === 'update_node_content_with_anchors') return {};
    if (command === 'create_topic') return { createdNodeIds: [args.nodeId], nodes: [{ nodeId: args.nodeId, currentVersionId: 'initial' }] };
    if (command === 'import_clipboard_image_attachment') {
      attachmentBytes.push(args.bytesBase64);
      return { storage_key: `attachment-${attachmentBytes.length}.png`, original_name: args.originalName, attachment_id: `attachment-${attachmentBytes.length}`, status: 'imported' };
    }
    return { status: 'ready' };
  });
  const progress = [];
  const result = await createSyncFromZeroDataset({
    dataset: { attachmentBytes: 128, attachmentCount: 3, contentBodyBytes: 32,
      nodeCount: 2, nodePrefix: 'sync-from-zero-a-' }, evidenceRoot: root,
    now: () => new Date('2026-08-13T00:00:00.000Z'), onProgress: (item) => progress.push(item),
    session: { invoke }
  });
  expect(result).toMatchObject({ attachmentCount: 3, nodeCount: 2, resultStatus: 'success' });
  expect(new Set(attachmentBytes).size).toBe(3);
  const nodes = invoke.mock.calls.filter(([command]) => command === 'update_node_content_with_anchors').map(([, args]) => args);
  expect(nodes.flatMap(node => node.edit.newImageReferences ?? [])).toHaveLength(3);
  for (const node of nodes) for (const reference of node.edit.newImageReferences ?? []) {
    expect(node.parent.content).toContain(`asset://${reference.storage_key}`);
  }
  expect(progress).toEqual([
    { completed: 2, phase: 'nodes', total: 2 },
    { completed: 3, phase: 'attachments', total: 3 }
  ]);
});
