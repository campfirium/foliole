import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { loadCachedRuntimeLibraryPathSettings, setRuntimeLibraryPathSettingsCache } from './libraryPathSettingsCache';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type RuntimeLibraryPathLocation = 'library_home' | 'assets_dir' | 'inbox' | 'mirror';

export interface RuntimeLibraryPaths {
  assetsDir: string;
  dataDir: string;
  databasePath: string;
  inbox: string;
  libraryHome: string;
  mirror: string;
  updatedAt: string;
}

export const EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR = 'existing_library_home_requires_confirmation';

export interface RuntimeLibraryPathUpdateOptions {
  confirmExistingLibraryHome?: boolean;
}

export interface RuntimeMirrorAttachmentLinkRebuildResult {
  scannedDocumentCount: number;
  rewrittenDocumentCount: number;
  rewrittenLinkCount: number;
  updatedAt: string;
}

export interface RuntimeMirrorOutputRebuildResult {
  queuedArticleCount: number;
  rebuiltArticleCount: number;
  failedArticleCount: number;
  pendingArticleCount: number;
  updatedAt: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toRuntimeLibraryPaths(payload: unknown): RuntimeLibraryPaths | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const value = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(value.assets_dir) ||
    !isNonEmptyString(value.data_dir) ||
    !isNonEmptyString(value.database_path) ||
    !isNonEmptyString(value.inbox) ||
    !isNonEmptyString(value.library_home) ||
    !isNonEmptyString(value.mirror) ||
    !isNonEmptyString(value.updated_at)
  ) {
    return null;
  }

  return {
    assetsDir: value.assets_dir,
    dataDir: value.data_dir,
    databasePath: value.database_path,
    inbox: value.inbox,
    libraryHome: value.library_home,
    mirror: value.mirror,
    updatedAt: value.updated_at
  };
}

function toRuntimeMirrorAttachmentLinkRebuildResult(
  payload: unknown
): RuntimeMirrorAttachmentLinkRebuildResult | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const value = payload as Record<string, unknown>;
  if (
    typeof value.scanned_document_count !== 'number' ||
    typeof value.rewritten_document_count !== 'number' ||
    typeof value.rewritten_link_count !== 'number' ||
    !isNonEmptyString(value.updated_at)
  ) {
    return null;
  }

  return {
    scannedDocumentCount: value.scanned_document_count,
    rewrittenDocumentCount: value.rewritten_document_count,
    rewrittenLinkCount: value.rewritten_link_count,
    updatedAt: value.updated_at
  };
}

function toRuntimeMirrorOutputRebuildResult(payload: unknown): RuntimeMirrorOutputRebuildResult | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const value = payload as Record<string, unknown>;
  if (
    typeof value.queued_article_count !== 'number' ||
    typeof value.rebuilt_article_count !== 'number' ||
    typeof value.failed_article_count !== 'number' ||
    typeof value.pending_article_count !== 'number' ||
    !isNonEmptyString(value.updated_at)
  ) {
    return null;
  }

  return {
    queuedArticleCount: value.queued_article_count,
    rebuiltArticleCount: value.rebuilt_article_count,
    failedArticleCount: value.failed_article_count,
    pendingArticleCount: value.pending_article_count,
    updatedAt: value.updated_at
  };
}

export function loadRuntimeLibraryPathSettings(): Promise<RuntimeLibraryPaths | null> {
  return loadCachedRuntimeLibraryPathSettings(loadRuntimeLibraryPathSettingsFromSource);
}

async function loadRuntimeLibraryPathSettingsFromSource(): Promise<RuntimeLibraryPaths | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = toRuntimeLibraryPaths(await runtimeInvoke(NATIVE_COMMANDS.loadLibraryPathSettings));
    if (!result) {
      logRuntimeWarning('native library path payload invalid', {
        action: 'load_runtime_library_path_settings',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadLibraryPathSettings,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native library path load failed', {
      action: 'load_runtime_library_path_settings',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadLibraryPathSettings,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export async function updateRuntimeLibraryPathSetting(
  location: RuntimeLibraryPathLocation,
  nextPath: string | null,
  options: RuntimeLibraryPathUpdateOptions = {}
): Promise<RuntimeLibraryPaths> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    throw new Error('desktop runtime unavailable');
  }

  try {
    const args: Record<string, unknown> = {
      location,
      path: nextPath
    };
    if (options.confirmExistingLibraryHome === true) {
      args.confirm_existing_library_home = true;
    }
    const result = toRuntimeLibraryPaths(
      await runtimeInvoke(NATIVE_COMMANDS.updateLibraryPathSetting, args)
    );
    if (!result) {
      throw new Error('native library path payload invalid');
    }
    setRuntimeLibraryPathSettingsCache(result);
    return result;
  } catch (error) {
    logRuntimeWarning('native library path update failed', {
      action: 'update_runtime_library_path_setting',
      area: 'bridge',
      command: NATIVE_COMMANDS.updateLibraryPathSetting,
      fallback: 'rethrow_to_ui',
      error,
      location
    });
    throw error;
  }
}

export async function rebuildRuntimeMirrorOutput(): Promise<RuntimeMirrorOutputRebuildResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    throw new Error('desktop runtime unavailable');
  }

  try {
    const result = toRuntimeMirrorOutputRebuildResult(await runtimeInvoke(NATIVE_COMMANDS.rebuildMirrorOutput));
    if (!result) {
      throw new Error('native mirror output rebuild payload invalid');
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native mirror output rebuild failed', {
      action: 'rebuild_runtime_mirror_output',
      area: 'bridge',
      command: NATIVE_COMMANDS.rebuildMirrorOutput,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}

export async function rebuildRuntimeMirrorAttachmentLinks(): Promise<RuntimeMirrorAttachmentLinkRebuildResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    throw new Error('desktop runtime unavailable');
  }

  try {
    const result = toRuntimeMirrorAttachmentLinkRebuildResult(
      await runtimeInvoke(NATIVE_COMMANDS.rebuildMirrorAttachmentLinks)
    );
    if (!result) {
      throw new Error('native mirror rebuild payload invalid');
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native mirror link rebuild failed', {
      action: 'rebuild_runtime_mirror_attachment_links',
      area: 'bridge',
      command: NATIVE_COMMANDS.rebuildMirrorAttachmentLinks,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}
