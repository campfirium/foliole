export type RuntimeLogArea = 'bridge' | 'native' | 'persistence';

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

function writeRuntimeLog(level: 'warn' | 'error', message: string, context: RuntimeLogContext) {
  const writer = level === 'error' ? console.error : console.warn;
  writer(`[${context.area}] ${message}`, toRuntimeLogPayload(context));
}

export function logRuntimeWarning(message: string, context: RuntimeLogContext) {
  writeRuntimeLog('warn', message, context);
}

export function logRuntimeError(message: string, context: RuntimeLogContext) {
  writeRuntimeLog('error', message, context);
}
