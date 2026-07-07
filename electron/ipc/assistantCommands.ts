import { app } from 'electron';

import type { NativeAssistantThreadOpeningLocation } from '../../lib/platform/nativeAssistantContract.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAppVersion } from '../appVersion.js';
import { CodexAppServerAdapter } from '../assistant/codexAppServerAdapter.js';
import {
  archiveAssistantThreadIndex,
  deleteAssistantThreadIndex,
  getAssistantThreadIndex,
  listAssistantThreadIndex,
  upsertAssistantThreadIndex
} from '../database/assistantThreadIndex.js';

let adapter: CodexAppServerAdapter | null = null;

function getAdapter() {
  adapter ??= new CodexAppServerAdapter({ appVersion: resolveFolioleAppVersion(app) });
  return adapter;
}

export async function handleAssistantCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.assistantGetStatus) return getAdapter().getStatus();
  if (command === NATIVE_COMMANDS.assistantSendMessage) return sendMessage(args);
  if (command === NATIVE_COMMANDS.assistantListThreadIndex) {
    const location = readOpeningLocation(args.location);
    return listAssistantThreadIndex({
      ...(args.includeArchived === true ? { includeArchived: true } : {}),
      ...(args.includeDeleted === true ? { includeDeleted: true } : {}),
      ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
      ...(location ? { location } : {})
    });
  }
  if (command === NATIVE_COMMANDS.assistantArchiveThreadIndex) {
    return archiveAssistantThreadIndex(readProviderThreadId(args));
  }
  if (command === NATIVE_COMMANDS.assistantDeleteThreadIndex) {
    return deleteAssistantThreadIndex(readProviderThreadId(args));
  }
  return undefined;
}

export function resetAssistantCommandAdapterForTests() {
  adapter = null;
}

async function sendMessage(args: Record<string, unknown>) {
  const message = typeof args.message === 'string' ? args.message : '';
  let openingLocation: NativeAssistantThreadOpeningLocation | undefined;
  let providerThreadId: string | undefined;
  try {
    openingLocation = readOpeningLocation(args.openingLocation);
    providerThreadId = readOptionalProviderThreadId(args.providerThreadId);
  } catch {
    return {
      failure: { category: 'protocol_error' as const },
      provider: 'codex-app-server' as const,
      state: 'failed' as const
    };
  }
  if (!isThreadLocationAllowed(providerThreadId, openingLocation)) {
    return {
      failure: { category: 'protocol_error' as const },
      provider: 'codex-app-server' as const,
      state: 'failed' as const
    };
  }
  const result = await getAdapter().sendMessage({
    message,
    ...(providerThreadId ? { providerThreadId } : {})
  });
  if (result.state !== 'ready' || !openingLocation || !result.message?.threadId) return result;
  try {
    return {
      ...result,
      threadIndex: upsertAssistantThreadIndex({
        location: openingLocation,
        message,
        providerThreadId: result.message.threadId
      })
    };
  } catch {
    return {
      failure: { category: 'persistence_failed' as const },
      provider: result.provider,
      state: 'failed' as const
    };
  }
}

function readOpeningLocation(value: unknown): NativeAssistantThreadOpeningLocation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const location = value as Record<string, unknown>;
  if (location.type === 'workspace') return { type: 'workspace' };
  if (location.type === 'node' && typeof location.nodeId === 'string') {
    const nodeId = normalizeRequiredString(location.nodeId, 'node_id');
    return { nodeId, type: 'node' };
  }
  throw new Error('invalid_assistant_thread_location');
}

function readProviderThreadId(args: Record<string, unknown>) {
  if (typeof args.providerThreadId !== 'string') throw new Error('invalid_provider_thread_id');
  return normalizeRequiredString(args.providerThreadId, 'provider_thread_id');
}

function readOptionalProviderThreadId(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('invalid_provider_thread_id');
  return normalizeRequiredString(value, 'provider_thread_id');
}

function isThreadLocationAllowed(
  providerThreadId: string | undefined,
  openingLocation: NativeAssistantThreadOpeningLocation | undefined
) {
  if (!providerThreadId) return true;
  if (!openingLocation) return false;
  try {
    const existing = getAssistantThreadIndex(providerThreadId);
    return areOpeningLocationsEqual(existing.location, openingLocation);
  } catch {
    return false;
  }
}

function areOpeningLocationsEqual(
  left: NativeAssistantThreadOpeningLocation,
  right: NativeAssistantThreadOpeningLocation
) {
  if (left.type !== right.type) return false;
  return left.type === 'workspace' || left.nodeId === (right as { nodeId: string }).nodeId;
}

function normalizeRequiredString(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid_${field}`);
  return normalized;
}
