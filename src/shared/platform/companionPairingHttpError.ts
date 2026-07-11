import type { SyncProtocolCompatibilityResult } from '../../../lib/platform/syncProtocolContract';

export class CompanionPairingHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly compatibility: SyncProtocolCompatibilityResult | null
  ) {
    super(`Desktop pairing failed with ${status}: ${code}.`);
    this.name = 'CompanionPairingHttpError';
  }
}

export async function readCompanionPairingError(response: Response) {
  let payload: { compatibility?: SyncProtocolCompatibilityResult; error?: unknown } = {};
  try {
    payload = await response.json() as typeof payload;
  } catch {
    return new CompanionPairingHttpError(response.status, 'invalid_error_payload', null);
  }
  const code = typeof payload.error === 'string' && payload.error.trim() ? payload.error : 'unknown_error';
  return new CompanionPairingHttpError(response.status, code, payload.compatibility ?? null);
}
