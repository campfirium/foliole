import { Capacitor } from '@capacitor/core';

import { parseAssetMarkdownUrl } from '../../../lib/platform/assetMarkdownUrl';
import { parseCanonicalAttachmentStorageKey } from '../../../lib/platform/attachmentResource';
import type { AttachmentResourceDescription } from '../../../lib/platform/attachmentResource';
import {
  clearAttachmentResourceDescriptions,
  listAttachmentResourceDescriptions,
  registerAttachmentResourceDescriptions,
  resolveAttachmentResourceDescription
} from '../../../lib/platform/attachmentResourceRegistry';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeAttachmentResourceResolution } from '../../../lib/platform/nativeUtilityContract';
import { createBoundedCache } from '../lib/boundedCache';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  FolioleCompanionSync,
  isNativeCompanionAttachmentResourceRuntime
} from './companionWorkspaceRuntimeRepository';
import { updateImageCacheStats } from './performanceDiagnosticsProbe';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

function isAttachmentResourceResolution(value: unknown): value is NativeAttachmentResourceResolution {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.status === 'ready' || candidate.status === 'not_found' || candidate.status === 'missing_file';
}

const MAX_ATTACHMENT_RESOURCE_RESOLUTIONS = 512;
const attachmentResourceResolutionCache = createBoundedCache<
  string,
  Promise<NativeAttachmentResourceResolution | null>
>(MAX_ATTACHMENT_RESOURCE_RESOLUTIONS);

export { registerAttachmentResourceDescriptions };

export async function resolveRuntimeAttachmentResource(resourceUrl: string) {
  const storageKey = parseAssetMarkdownUrl(resourceUrl);
  const parsed = storageKey ? parseCanonicalAttachmentStorageKey(storageKey) : null;
  if (!storageKey || !parsed) return null;
  const description = resolveAttachmentResourceDescription(storageKey);
  if (!description) return null;

  if (isNativeCompanionAttachmentResourceRuntime()) {
    return resolveNativeAttachmentResource(description);
  }

  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  const cached = attachmentResourceResolutionCache.get(storageKey);
  if (cached) {
    updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: true });
    return cached;
  }

  const resolutionPromise = runtimeInvoke(NATIVE_COMMANDS.resolveAttachmentResource, {
    attachment_id: description.attachmentId,
    content_hash: description.contentHash,
    library_scope: description.libraryScope,
    mime_type: description.mimeType,
    storage_key: description.storageKey
  })
    .then((result) => {
      if (!isAttachmentResourceResolution(result)) {
        logRuntimeWarning('native attachment resource payload invalid', {
          area: 'bridge',
          action: 'resolve_attachment_resource',
          command: NATIVE_COMMANDS.resolveAttachmentResource,
          storage_key: storageKey,
          fallback: 'return_null'
        });
        attachmentResourceResolutionCache.delete(storageKey);
        return null;
      }
      return result;
    })
    .catch((error) => {
      logRuntimeWarning('native attachment resource resolve failed', {
        area: 'bridge',
        action: 'resolve_attachment_resource',
        command: NATIVE_COMMANDS.resolveAttachmentResource,
        storage_key: storageKey,
        fallback: 'return_null',
        error
      });
      attachmentResourceResolutionCache.delete(storageKey);
      return null;
    });

  attachmentResourceResolutionCache.set(storageKey, resolutionPromise);
  updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: false });
  return resolutionPromise;
}

async function resolveNativeAttachmentResource(description: AttachmentResourceDescription) {
  const cached = attachmentResourceResolutionCache.get(description.storageKey);
  if (cached) {
    updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: true });
    return cached;
  }

  const resolutionPromise = resolveNativeAttachmentResourceUncached(description)
    .then((result) => normalizeNativeAttachmentResolution(result, description.storageKey))
    .catch((error) => {
      logRuntimeWarning('native companion attachment resource resolve failed', {
        area: 'bridge',
        action: 'resolve_attachment_resource',
        storage_key: description.storageKey,
        fallback: 'return_null',
        error
      });
      attachmentResourceResolutionCache.delete(description.storageKey);
      return null;
    });

  attachmentResourceResolutionCache.set(description.storageKey, resolutionPromise);
  updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: false });
  return resolutionPromise;
}

async function resolveNativeAttachmentResourceUncached(description: AttachmentResourceDescription) {
  return FolioleCompanionSync.resolveAttachmentResource({
    attachment_id: description.attachmentId,
    content_hash: description.contentHash,
    library_scope: description.libraryScope,
    mime_type: description.mimeType,
    storage_key: description.storageKey
  });
}

function normalizeNativeAttachmentResolution(
  result: unknown,
  attachmentId: string
): NativeAttachmentResourceResolution | null {
  if (!isAttachmentResourceResolution(result)) {
    logRuntimeWarning('native companion attachment resource payload invalid', {
      area: 'bridge',
      action: 'resolve_attachment_resource',
      attachment_id: attachmentId,
      fallback: 'return_null'
    });
    attachmentResourceResolutionCache.delete(attachmentId);
    return null;
  }
  if (result.status !== 'ready') {
    return result;
  }
  return {
    ...result,
    resource_url: Capacitor.convertFileSrc(result.resource_url)
  };
}

export function readAttachmentResourceCacheStats() {
  return {
    entries: attachmentResourceResolutionCache.size
  };
}

export function invalidateAttachmentResourceResolution(attachmentId: string) {
  for (const description of listAttachmentResourceDescriptions()) {
    if (description.attachmentId === attachmentId) attachmentResourceResolutionCache.delete(description.storageKey);
  }
}

export function resetAttachmentResourceResolutionCacheForTest() {
  attachmentResourceResolutionCache.clear();
  clearAttachmentResourceDescriptions();
}
