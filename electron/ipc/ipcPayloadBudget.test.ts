// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import {
  IPC_REQUEST_PAYLOAD_WARNING_BYTES,
  recordIpcPayloadBudget
} from './ipcPayloadBudget.js';

const { appendDiagnosticLog } = vi.hoisted(() => ({
  appendDiagnosticLog: vi.fn()
}));

vi.mock('../diagnostics/diagnosticLog.js', () => ({ appendDiagnosticLog }));

beforeEach(() => {
  vi.clearAllMocks();
  appendDiagnosticLog.mockResolvedValue(undefined);
});

it('records only IPC payload metadata when the payload exceeds the budget', () => {
  recordIpcPayloadBudget({
    budgetBytes: 16,
    command: 'load_workspace_snapshot',
    direction: 'response',
    payload: {
      secretBody: 'private workspace body text that must not be logged'
    }
  });

  expect(appendDiagnosticLog).toHaveBeenCalledWith(expect.objectContaining({
    event: 'ipc_payload_budget_exceeded',
    level: 'warn',
    payload: {
      budgetBytes: 16,
      command: 'load_workspace_snapshot',
      direction: 'response',
      sizeBytes: expect.any(Number)
    },
    source: 'electron.main'
  }));
  expect(JSON.stringify(appendDiagnosticLog.mock.calls)).not.toContain('private workspace body text');
});

it('skips diagnostics while IPC payloads stay inside the request budget', () => {
  recordIpcPayloadBudget({
    budgetBytes: IPC_REQUEST_PAYLOAD_WARNING_BYTES,
    command: 'app_get_version',
    direction: 'request',
    payload: { command: 'app_get_version', args: {} }
  });

  expect(appendDiagnosticLog).not.toHaveBeenCalled();
});
