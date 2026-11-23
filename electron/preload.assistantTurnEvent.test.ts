import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { expect, it, vi } from 'vitest';

const PRELOAD_PATH = path.resolve(process.cwd(), 'electron', 'preload.cjs');
const CHANNEL = 'foliole:assistant-turn-event';

function subscribeTurnEvents() {
  const exposeInMainWorld = vi.fn();
  const ipcOn = vi.fn();
  const sandboxRequire = vi.fn((specifier: string) => {
    if (specifier === 'electron') {
      return {
        contextBridge: { exposeInMainWorld },
        ipcRenderer: { invoke: vi.fn(), on: ipcOn, removeListener: vi.fn(), send: vi.fn() }
      };
    }
    throw new Error(`unsupported require: ${specifier}`);
  });
  vm.runInNewContext(readFileSync(PRELOAD_PATH, 'utf8'), {
    __filename: PRELOAD_PATH,
    exports: {},
    module: { exports: {} },
    process: { env: {} },
    require: sandboxRequire
  }, { filename: PRELOAD_PATH });
  const handler = vi.fn();
  exposeInMainWorld.mock.calls[0]?.[1].onAssistantTurnEvent(handler);
  const call = ipcOn.mock.calls.find(([channel]) => channel === CHANNEL);
  return { emit: (payload: unknown) => call?.[1]({}, payload), handler };
}

it('forwards write approval requests with only the fields the card shows', () => {
  const { emit, handler } = subscribeTurnEvents();
  emit({
    approval: {
      changes: [{
        details: [{ field: 'parent', value: '' }, { field: 'secret', value: 'x' }],
        extra: 'dropped',
        target: 'BYOK Agent Control Topic',
        tool: 'create_material'
      }],
      id: 'approval-1'
    },
    clientTurnId: 'turn-1',
    kind: 'approval_requested',
    provider: 'openai-compatible'
  });
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler.mock.calls[0]?.[0]).toMatchObject({
    approval: {
      changes: [{ details: [{ field: 'parent', value: '' }], target: 'BYOK Agent Control Topic', tool: 'create_material' }],
      id: 'approval-1'
    },
    clientTurnId: 'turn-1',
    kind: 'approval_requested'
  });
  expect(JSON.stringify(handler.mock.calls[0]?.[0])).not.toContain('dropped');
});

it('drops approval requests without a usable approval and unknown kinds', () => {
  const { emit, handler } = subscribeTurnEvents();
  emit({ clientTurnId: 'turn-1', kind: 'approval_requested' });
  emit({ approval: { changes: [{}], id: 'a' }, clientTurnId: 'turn-1', kind: 'approval_requested' });
  emit({ clientTurnId: 'turn-1', kind: 'unknown' });
  expect(handler).not.toHaveBeenCalled();
});
