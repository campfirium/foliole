import type { crashReporter as electronCrashReporter } from 'electron';

import { appendDiagnosticLog } from './diagnosticLog.js';

type CrashReporter = typeof electronCrashReporter;

type MainDiagnosticPayload = Record<string, unknown>;

function serializeErrorLike(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack
    };
  }
  return {
    message: typeof value === 'string' ? value : String(value)
  };
}

function readErrorName(value: unknown) {
  return value instanceof Error ? value.name : undefined;
}

function serializeMainDiagnosticPayload(payload: MainDiagnosticPayload) {
  const serialized: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (key !== 'error') {
      serialized[key] = value;
      return;
    }
    const error = serializeErrorLike(value);
    serialized.error = error;
    if (typeof error.message === 'string' && serialized.message === undefined) {
      serialized.message = error.message;
    }
    if (typeof error.name === 'string' && serialized.name === undefined) {
      serialized.name = error.name;
    }
  });
  return serialized;
}

export function appendMainProcessDiagnosticLog(
  event: string,
  payload: MainDiagnosticPayload = {}
) {
  void appendDiagnosticLog({
    event,
    level: 'error',
    occurred_at: new Date().toISOString(),
    payload: serializeMainDiagnosticPayload(payload),
    source: 'electron.main'
  }).catch((error) => {
    console.error(`[electron-main] diagnostic log failed: ${event}`, error);
  });
}

export function logMainProcessException(event: string, error: unknown) {
  appendMainProcessDiagnosticLog(event, {
    error
  });
}

export function logMainProcessOperationFailure(
  operation: string,
  payload: MainDiagnosticPayload,
  error: unknown,
  safeMessage = 'Operation failed'
) {
  appendMainProcessDiagnosticLog('operation_failed', {
    action: operation,
    message: safeMessage,
    ...(readErrorName(error) ? { name: readErrorName(error) } : {}),
    operation,
    status: 'failed',
    ...payload
  });
}

export function startLocalCrashReporter(
  crashReporter: CrashReporter,
  productName = 'Foliole'
) {
  crashReporter.start({
    compress: true,
    productName,
    uploadToServer: false
  });
}
