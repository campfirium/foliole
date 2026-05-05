import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../../lib/platform/nativeReadwiseContract';

import {
  toRuntimeReadwiseBooksInventory,
  type RuntimeReadwiseBooksInventory
} from './readwiseBooksBridgePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeReadwiseBookInventoryItem, RuntimeReadwiseBooksInventory } from './readwiseBooksBridgePayloads';

function isReadwiseBookDownloadResult(value: unknown): value is NativeReadwiseBookDownloadResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    (payload.book_key === null || typeof payload.book_key === 'string') &&
    (payload.title === null || typeof payload.title === 'string') &&
    (payload.url === null || typeof payload.url === 'string') &&
    (payload.status === 'book_not_found' || payload.status === 'missing_link' || payload.status === 'opened')
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
    (payload.epub_path === null || typeof payload.epub_path === 'string') &&
    (payload.status === 'book_not_found' || payload.status === 'cancelled' || payload.status === 'selected')
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
