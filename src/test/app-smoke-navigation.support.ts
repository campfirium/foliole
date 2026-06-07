import { vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createSmokeRuntimeInvoke } from './app-smoke.shared';

export function mockMoveRuntime() {
  const baseInvoke = createSmokeRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async (command, args?: unknown) => {
    if (command === 'move_nodes') {
      const payload = args as { nodeOrder: string[]; nodes: Array<{ nodeId: string }> };
      return { movedNodeIds: payload.nodes.map((node) => node.nodeId), nodeOrder: payload.nodeOrder };
    }
    return baseInvoke(command, args as Record<string, unknown> | undefined);
  }));
}

export function createTextAnchorLink(id: string, originalText: string, from: number) {
  return {
    id,
    kind: 'highlight' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}
