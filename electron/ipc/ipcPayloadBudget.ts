import { Buffer } from 'node:buffer';

import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

export const IPC_REQUEST_PAYLOAD_WARNING_BYTES = 512 * 1024;
export const IPC_RESPONSE_PAYLOAD_WARNING_BYTES = 2 * 1024 * 1024;

type IpcPayloadDirection = 'request' | 'response';

interface IpcPayloadBudgetInput {
  budgetBytes: number;
  command: string;
  direction: IpcPayloadDirection;
  payload: unknown;
}

function measureJsonPayloadBytes(payload: unknown) {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

function appendPayloadBudgetDiagnostic(
  event: string,
  payload: Record<string, unknown>
) {
  void appendDiagnosticLog({
    event,
    level: 'warn',
    occurred_at: new Date().toISOString(),
    payload,
    source: 'electron.main'
  }).catch((error) => {
    console.error(`[electron-main] ipc payload budget diagnostic failed: ${event}`, error);
  });
}

export function recordIpcPayloadBudget(input: IpcPayloadBudgetInput) {
  let sizeBytes: number;
  try {
    sizeBytes = measureJsonPayloadBytes(input.payload);
  } catch (error) {
    appendPayloadBudgetDiagnostic('ipc_payload_budget_measure_failed', {
      command: input.command,
      direction: input.direction,
      message: error instanceof Error ? error.message : String(error)
    });
    return;
  }
  if (sizeBytes <= input.budgetBytes) {
    return;
  }
  appendPayloadBudgetDiagnostic('ipc_payload_budget_exceeded', {
    budgetBytes: input.budgetBytes,
    command: input.command,
    direction: input.direction,
    sizeBytes
  });
}
