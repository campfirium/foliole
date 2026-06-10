import { getElectronAPI } from './electronApi';

type DiagnosticLogLevel = 'warn' | 'error' | 'info' | 'debug';
export type RuntimeLogArea = 'bridge' | 'native' | 'persistence';

export interface DiagnosticLogPayload {
  event: string;
  level: DiagnosticLogLevel;
  occurredAt?: string;
  payload?: Record<string, unknown>;
  source: string;
}

interface RuntimeLogContext {
  area: RuntimeLogArea;
  action: string;
  command?: string;
  fallback?: string;
  error?: unknown;
  [key: string]: unknown;
}

interface RuntimeErrorDetails {
  message: string;
  name?: string;
}

function toRuntimeErrorDetails(error: unknown): RuntimeErrorDetails {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name
    };
  }
  return {
    message: String(error)
  };
}

function toRuntimeLogPayload(context: RuntimeLogContext) {
  const { error, ...payload } = context;
  if (error === undefined) {
    return payload;
  }
  return {
    ...payload,
    error: toRuntimeErrorDetails(error)
  };
}

function toDiagnosticEventName(message: string) {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'runtime_event';
}

function toRuntimeLogSource(area: RuntimeLogArea) {
  return `renderer.${area}`;
}

function toConsoleMessage(event: string) {
  return event.replace(/_/g, ' ');
}

export function logRuntimeEvent(input: DiagnosticLogPayload) {
  const runtimeLogger = getElectronAPI()?.logDiagnosticEvent;
  if (!runtimeLogger) {
    const fallbackArea = input.source.startsWith('renderer.') ? input.source.slice('renderer.'.length) : input.source;
    const writer = input.level === 'error' ? console.error : console.warn;
    writer(`[${fallbackArea}] ${toConsoleMessage(input.event)}`, input.payload ?? {});
    return;
  }

  void runtimeLogger({
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  }).catch((error) => {
    console.error('[runtime-log] failed to persist diagnostic event', {
      error: toRuntimeErrorDetails(error),
      event: input.event,
      payload: input.payload,
      source: input.source
    });
  });
}

export function logRuntimeWarning(message: string, context: RuntimeLogContext) {
  logRuntimeEvent({
    event: toDiagnosticEventName(message),
    level: 'warn',
    payload: toRuntimeLogPayload(context),
    source: toRuntimeLogSource(context.area)
  });
}

export function logRuntimeError(message: string, context: RuntimeLogContext) {
  logRuntimeEvent({
    event: toDiagnosticEventName(message),
    level: 'error',
    payload: toRuntimeLogPayload(context),
    source: toRuntimeLogSource(context.area)
  });
}
