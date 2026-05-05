import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';

import {
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealToRuntime
} from './workspaceRuntimeSync';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createNodeFixture(): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    title: 'Seed',
    isTitleManual: false,
    content: '# Seed',
    anchorLink: { id: 'hl-1', kind: 'highlight' },
    reveal: 'Reveal',
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  };
}

describe('workspaceRuntimeSync', () => {
  it('sends node content updates through update_node_content command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeContentToRuntime(createNodeFixture());

    expect(invoke).toHaveBeenCalledWith('update_node_content', {
      nodeId: 'node-1',
      parentNodeId: null,
      title: 'Seed',
      isTitleManual: false,
      content: '# Seed',
      reveal: 'Reveal',
      anchorLink: { id: 'hl-1', kind: 'highlight' },
      position: null,
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:00:01.000Z'
    });
    const invokedCommands = invoke.mock.calls.map((call) => call[0]);
    expect(invokedCommands).not.toContain('save_workspace_state');
  });

  it('skips sync when runtime invoke is unavailable', () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    expect(() => syncNodeContentToRuntime(createNodeFixture())).not.toThrow();
  });

  it('sends reveal updates through update_node_reveal command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeRevealToRuntime(createNodeFixture());

    expect(invoke).toHaveBeenCalledWith('update_node_reveal', {
      nodeId: 'node-1',
      parentNodeId: null,
      title: 'Seed',
      isTitleManual: false,
      content: '# Seed',
      reveal: 'Reveal',
      anchorLink: { id: 'hl-1', kind: 'highlight' },
      position: null,
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:00:01.000Z'
    });
  });

  it('syncs full node order through replace_node_order command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeOrderToRuntime(['node-1', 'node-2']);

    expect(invoke).toHaveBeenCalledWith('replace_node_order', { nodeIds: ['node-1', 'node-2'] });
  });
});
