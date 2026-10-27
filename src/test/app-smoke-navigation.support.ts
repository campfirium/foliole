import { vi } from 'vitest';

import type { NativeMoveNodesArgs } from '../../lib/platform/nativeMoveContract';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createSmokeRuntimeInvoke } from './app-smoke.shared';
import { workspaceMoveReceipt } from './workspaceMoveReceipt';

export function mockMoveRuntime() {
  const baseInvoke = createSmokeRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async (command, args?: unknown) => {
    if (command === 'move_nodes') {
      return workspaceMoveReceipt(args as NativeMoveNodesArgs);
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
