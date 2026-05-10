import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseBookImportResetResult,
  NativeReadwiseBookEpubProgressEvent,
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../../lib/platform/nativeReadwiseContract';

import { getElectronAPI } from './electronApi';
import {
  toRuntimeReadwiseBooksInventory,
  type RuntimeReadwiseBooksInventory
} from './readwiseBooksRuntimePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeReadwiseBookInventoryItem, RuntimeReadwiseBooksInventory } from './readwiseBooksRuntimePayloads';

export interface RuntimeReadwiseBookEpubProgressEvent {
  detail: string;
  nodeId: string;
  phase: NativeReadwiseBookEpubProgressEvent['phase'];
  progress: number;
}

function isReadwiseBookDownloadResult(value: unknown): value is NativeReadwiseBookDownloadResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    (payload.book_key === null || typeof payload.book_key === 'string') &&
    (payload.title === null || typeof payload.title === 'string') &&
    (payload.url === null || typeof payload.url === 'string') &&
    (payload.status === 'book_not_found' ||
      payload.status === 'missing_link' ||
      payload.status === 'opened' ||
      payload.status === 'blocked_secondary')
  );
}

function isReadwiseBookEpubLoadResult(value: unknown): value is NativeReadwiseBookEpubLoadResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    (payload.book_key === null || typeof payload.book_key === 'string') &&
    (payload.title === null || typeof payload.title === 'string') &&
    (payload.error_message === undefined || payload.error_message === null || typeof payload.error_message === 'string') &&
    (payload.epub_path === null || typeof payload.epub_path === 'string') &&
    (payload.status === 'book_not_found' ||
      payload.status === 'cancelled' ||
      payload.status === 'selected' ||
      payload.status === 'failed' ||
      payload.status === 'blocked_secondary')
  );
}

function isReadwiseBookImportResetResult(value: unknown): value is NativeReadwiseBookImportResetResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    (payload.book_key === null || typeof payload.book_key === 'string') &&
    (payload.content === null || typeof payload.content === 'string') &&
    (payload.node_id === null || typeof payload.node_id === 'string') &&
    Array.isArray(payload.removed_node_ids) &&
    payload.removed_node_ids.every((item) => typeof item === 'string') &&
    (payload.status === 'book_not_found' || payload.status === 'reset' || payload.status === 'blocked_secondary') &&
    (payload.title === null || typeof payload.title === 'string') &&
    (payload.updated_at === null || typeof payload.updated_at === 'string')
  );
}

function isReadwiseBookEpubProgressEvent(value: unknown): value is NativeReadwiseBookEpubProgressEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.detail === 'string' &&
    typeof payload.node_id === 'string' &&
    typeof payload.progress === 'number' &&
    (payload.phase === 'importing_epub' ||
      payload.phase === 'placing_highlights' ||
      payload.phase === 'completed' ||
      payload.phase === 'failed')
  );
}

export async function loadRuntimeReadwiseBooksInventory(): Promise<RuntimeReadwiseBooksInventory | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const inventory = toRuntimeReadwiseBooksInventory(await runtimeInvoke(NATIVE_COMMANDS.loadReadwiseBooksInventory));
    if (!inventory) {
      logRuntimeWarning('native readwise books inventory payload invalid', {
        action: 'load_runtime_readwise_books_inventory',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadReadwiseBooksInventory,
        fallback: 'return_null'
      });
    }
    return inventory;
  } catch (error) {
    logRuntimeWarning('native readwise books inventory loading failed', {
      action: 'load_runtime_readwise_books_inventory',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadReadwiseBooksInventory,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export async function openRuntimeReadwiseBookDownload(nodeId: string): Promise<NativeReadwiseBookDownloadResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.openReadwiseBookDownload, { node_id: nodeId });
    if (!isReadwiseBookDownloadResult(result)) {
      logRuntimeWarning('native readwise book download payload invalid', {
        action: 'open_runtime_readwise_book_download',
        area: 'bridge',
        command: NATIVE_COMMANDS.openReadwiseBookDownload,
        fallback: 'return_null'
      });
      return null;
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native readwise book download failed', {
      action: 'open_runtime_readwise_book_download',
      area: 'bridge',
      command: NATIVE_COMMANDS.openReadwiseBookDownload,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export async function loadRuntimeReadwiseBookEpub(nodeId: string): Promise<NativeReadwiseBookEpubLoadResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.loadReadwiseBookEpub, { node_id: nodeId });
    if (!isReadwiseBookEpubLoadResult(result)) {
      logRuntimeWarning('native readwise book epub payload invalid', {
        action: 'load_runtime_readwise_book_epub',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadReadwiseBookEpub,
        fallback: 'return_null'
      });
      return null;
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native readwise book epub loading failed', {
      action: 'load_runtime_readwise_book_epub',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadReadwiseBookEpub,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export async function resetRuntimeReadwiseBookImport(nodeId: string): Promise<NativeReadwiseBookImportResetResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.resetReadwiseBookImport, { node_id: nodeId });
    if (!isReadwiseBookImportResetResult(result)) {
      logRuntimeWarning('native readwise book import reset payload invalid', {
        action: 'reset_runtime_readwise_book_import',
        area: 'bridge',
        command: NATIVE_COMMANDS.resetReadwiseBookImport,
        fallback: 'return_null'
      });
      return null;
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native readwise book import reset failed', {
      action: 'reset_runtime_readwise_book_import',
      area: 'bridge',
      command: NATIVE_COMMANDS.resetReadwiseBookImport,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export function onRuntimeReadwiseBookEpubProgress(
  handler: (payload: RuntimeReadwiseBookEpubProgressEvent) => void
): (() => void) | null {
  const bridge = getElectronAPI();
  if (!bridge?.onReadwiseBookEpubProgress) {
    return null;
  }
  return bridge.onReadwiseBookEpubProgress((payload) => {
    const normalized = {
      detail: payload.detail,
      node_id: payload.nodeId,
      phase: payload.phase,
      progress: payload.progress
    };
    if (!isReadwiseBookEpubProgressEvent(normalized)) {
      return;
    }
    handler({
      detail: normalized.detail,
      nodeId: normalized.node_id,
      phase: normalized.phase,
      progress: normalized.progress
    });
  });
}
