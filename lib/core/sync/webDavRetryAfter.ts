import { webDavRelayStatus } from './webDavRelayPublication.js';

export class WebDavServiceBusyError extends Error {
  constructor(readonly status: number, readonly retryAt: number | undefined, cause: unknown, readonly deferred = false) {
    super(`webdav_relay_service_busy:${status}`, { cause });
  }
}

export function readWebDavRetryAfter(header: string | undefined, receivedAt: number) {
  const value = header?.trim();
  if (!value) return undefined;
  if (/^\d+$/u.test(value)) return Math.min(Number.MAX_SAFE_INTEGER, receivedAt + Number(value) * 1_000);
  const asctime = /^[a-z]{3} [a-z]{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/iu.test(value);
  if (!asctime && !/^[a-z]+, .*\d{2}:\d{2}:\d{2} GMT$/iu.test(value)) return undefined;
  const date = Date.parse(asctime ? `${value} GMT` : value);
  return Number.isFinite(date) ? date : undefined;
}

export async function consumeWebDavResponse<Result>(
  status: number, retryAfter: string | undefined, body: AsyncIterable<Uint8Array>,
  consume: (status: number, body: AsyncIterable<Uint8Array>) => Promise<Result>
): Promise<Result> {
  if (status !== 429 && status !== 503) return consume(status, body);
  const retryAt = readWebDavRetryAfter(retryAfter, Date.now());
  try {
    await webDavRelayStatus(status, body);
  } catch (error) {
    throw new WebDavServiceBusyError(status, retryAt, error);
  }
  throw new WebDavServiceBusyError(status, retryAt, undefined);
}
