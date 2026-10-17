import { expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { syncCreateNodeMutationToRuntime } from './workspaceRuntimeSync';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

it('carries prepared image names through the complete node creation bridge adapter', async () => {
  const image = { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Original.png', role: 'image' as const };
  const node: Node = { id: 'sample', kind: 'topic', parentNodeId: null, title: 'Sample',
    content: `![sample](asset://${image.storage_key})`, reveal: null, review: null, anchorLink: null,
    createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z', pendingImageReferences: [image] };
  const invoke = vi.fn().mockResolvedValue(null);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  await syncCreateNodeMutationToRuntime(node, ['sample']);
  expect(invoke).toHaveBeenCalledWith('create_topic', expect.objectContaining({
    nodeId: 'sample', content: node.content, newImageReferences: [image]
  }));
});
