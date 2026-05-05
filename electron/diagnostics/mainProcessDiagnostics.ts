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

function serializeMainDiagnosticPayload(payload: MainDiagnosticPayload) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      key === 'error' ? serializeErrorLike(value) : value
    ])
  );
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
