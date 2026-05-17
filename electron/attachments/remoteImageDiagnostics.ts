import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

export interface RemoteImageDiagnosticEvent {
  attempt: number;
  bytes: number | null;
  cache: 'disk' | 'failure' | 'none' | 'write_failed';
  contentType: string | null;
  elapsedMs: number;
  errorCode: string | null;
  imageHost: string;
  sourceOrigin: string | null;
  status: number | null;
  strategy: 'direct' | 'source-origin';
  transport: 'electron.net.fetch' | 'global.fetch' | 'test';
}

let diagnosticSinkForTests: ((event: RemoteImageDiagnosticEvent) => void) | null = null;

function toSafeDiagnosticPayload(event: RemoteImageDiagnosticEvent) {
  return {
    attempt: event.attempt,
    bytes: event.bytes,
    cache: event.cache,
    content_type: event.contentType,
    elapsed_ms: event.elapsedMs,
    error_code: event.errorCode,
    image_host: event.imageHost,
    source_origin: event.sourceOrigin,
    status: event.status,
    strategy: event.strategy,
    transport: event.transport
  };
}

export function recordRemoteImageDiagnostic(event: RemoteImageDiagnosticEvent) {
  diagnosticSinkForTests?.(event);
  void appendDiagnosticLog({
    event: 'remote_image_request',
    level: 'info',
    occurred_at: new Date().toISOString(),
    payload: toSafeDiagnosticPayload(event),
    source: 'electron.remoteImage'
  }).catch(() => undefined);
}

export function configureRemoteImageDiagnosticSinkForTests(
  sink: ((event: RemoteImageDiagnosticEvent) => void) | null
) {
  diagnosticSinkForTests = sink;
}
