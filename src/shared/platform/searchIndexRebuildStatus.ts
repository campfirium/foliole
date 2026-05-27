import type { FullTextSearchIndexStrategy } from '../../../lib/core/database/fullTextSearchIndexStrategy';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeSearchIndexRebuildStatus } from '../../../lib/platform/nativeSearchIndexCommandMap';

import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

export type SearchIndexRebuildStatus = NativeSearchIndexRebuildStatus;

function normalizeStatus(value: unknown): SearchIndexRebuildStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.status !== 'failed' && input.status !== 'ready' && input.status !== 'rebuilding') return null;
  if (input.strategy !== 'cjk-trigram' && input.strategy !== 'word-based') return null;
  const status: SearchIndexRebuildStatus = {
    status: input.status,
    strategy: input.strategy
  };
  if (typeof input.error === 'string') {
    status.error = input.error;
  }
  return status;
}

export async function loadSearchIndexRebuildStatus() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  return normalizeStatus(await runtimeInvoke(NATIVE_COMMANDS.loadSearchIndexRebuildStatus));
}

export async function requestSearchIndexRebuild(strategy: FullTextSearchIndexStrategy) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  return normalizeStatus(await runtimeInvoke(NATIVE_COMMANDS.rebuildSearchIndex, { strategy }));
}

export function onSearchIndexRebuildStatus(handler: (status: SearchIndexRebuildStatus) => void) {
  const bridge = getElectronAPI();
  if (!bridge?.onSearchIndexRebuildStatus) return () => undefined;
  return bridge.onSearchIndexRebuildStatus((payload) => {
    const status = normalizeStatus(payload);
    if (status) handler(status);
  });
}
