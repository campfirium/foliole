import type { NativeAssistantThreadOpeningLocation } from '../../lib/platform/nativeAssistantContract.js';

export function readOptionalClientTurnId(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('invalid_client_turn_id');
  return normalizeRequiredString(value, 'client_turn_id');
}

export function readOpeningLocation(value: unknown): NativeAssistantThreadOpeningLocation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const location = value as Record<string, unknown>;
  if (location.type === 'workspace') return { type: 'workspace' };
  if (location.type === 'node' && typeof location.nodeId === 'string') {
    const nodeId = normalizeRequiredString(location.nodeId, 'node_id');
    return { nodeId, type: 'node' };
  }
  throw new Error('invalid_assistant_thread_location');
}

export function readProviderThreadId(args: Record<string, unknown>) {
  if (typeof args.providerThreadId !== 'string') throw new Error('invalid_provider_thread_id');
  return normalizeRequiredString(args.providerThreadId, 'provider_thread_id');
}

export function readOptionalProviderThreadId(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('invalid_provider_thread_id');
  return normalizeRequiredString(value, 'provider_thread_id');
}

function normalizeRequiredString(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid_${field}`);
  return normalized;
}
