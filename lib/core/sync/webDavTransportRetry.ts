import { WebDavServiceBusyError } from './webDavRetryAfter.js';

const retryableSocketCodes = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EPIPE',
  'ETIMEDOUT', 'EAI_AGAIN', 'ERR_STREAM_PREMATURE_CLOSE'
]);

const retryableNativeErrors = new Set([
  'ConnectException', 'SocketException', 'SocketTimeoutException', 'NoRouteToHostException',
  'UnknownHostException', 'InterruptedIOException', 'EOFException'
]);

export function isRetryableWebDavSendError(error: unknown): boolean {
  if (error instanceof WebDavServiceBusyError) return true;
  if (!(error instanceof Error)) return false;
  const prefix = 'webdav_relay_transport_failed:';
  if (error.message.startsWith(prefix)) return retryableNativeErrors.has(error.message.slice(prefix.length));
  if ('code' in error && typeof error.code === 'string' && retryableSocketCodes.has(error.code)) return true;
  return error.name === 'TimeoutError' || (error.name === 'AbortError' && error.cause instanceof Error &&
    error.cause.name === 'TimeoutError');
}

const MAX_RETRY_DELAY_MS = 300_000;

export function createWebDavTransportBackoff(initialDelay: number) {
  let delay = initialDelay;
  let deadline: number | undefined;
  return {
    get deadline() { return deadline; },
    update(error?: unknown) {
      if (error instanceof WebDavServiceBusyError && error.deferred) {
        deadline = error.retryAt;
      } else if (isRetryableWebDavSendError(error)) {
        deadline = Math.max(Date.now() + delay, error instanceof WebDavServiceBusyError ? error.retryAt ?? 0 : 0);
        delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      } else {
        deadline = undefined;
        delay = initialDelay;
      }
    }
  };
}
