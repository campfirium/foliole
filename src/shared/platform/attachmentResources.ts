import { Capacitor } from '@capacitor/core';

import { parseAssetMarkdownUrl } from '../../../lib/platform/assetMarkdownUrl';
import { parseCanonicalAttachmentStorageKey } from '../../../lib/platform/attachmentResource';
import type { AttachmentResourceDescription } from '../../../lib/platform/attachmentResource';
import {
  clearAttachmentResourceDescriptions,
  listAttachmentResourceDescriptions,
  registerAttachmentResourceDescriptions,
} from '../../../lib/platform/attachmentResourceRegistry';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeAttachmentResourceResolution } from '../../../lib/platform/nativeUtilityContract';
import { createBoundedCache } from '../lib/boundedCache';

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

  if (isNativeCompanionAttachmentResourceRuntime()) {
    return resolveNativeAttachmentResource(parsed);
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

  const resolutionPromise = runtimeInvoke(NATIVE_COMMANDS.resolveAttachmentResource, { storage_key: storageKey })
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

async function resolveNativeAttachmentResource(
  description: Pick<AttachmentResourceDescription, 'contentHash' | 'mimeType' | 'storageKey'>
) {
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

async function resolveNativeAttachmentResourceUncached(
  description: Pick<AttachmentResourceDescription, 'contentHash' | 'mimeType' | 'storageKey'>
) {
  return FolioleCompanionSync.resolveAttachmentResource({
    attachment_id: description.contentHash,
    content_hash: description.contentHash,
    mime_type: description.mimeType,
    storage_key: description.storageKey
  });
}

function normalizeNativeAttachmentResolution(
  result: unknown,
  storageKey: string
): NativeAttachmentResourceResolution | null {
  if (!isAttachmentResourceResolution(result)) {
    logRuntimeWarning('native companion attachment resource payload invalid', {
      area: 'bridge',
      action: 'resolve_attachment_resource',
      storage_key: storageKey,
      fallback: 'return_null'
    });
    attachmentResourceResolutionCache.delete(storageKey);
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

export function invalidateAttachmentResourceResolution(resourceIdentity: string) {
  const directStorageKey = parseAssetMarkdownUrl(resourceIdentity) ??
    parseCanonicalAttachmentStorageKey(resourceIdentity)?.storageKey;
  if (directStorageKey) attachmentResourceResolutionCache.delete(directStorageKey);
  for (const description of listAttachmentResourceDescriptions()) {
    if (description.attachmentId === resourceIdentity) {
      attachmentResourceResolutionCache.delete(description.storageKey);
    }
  }
}

export function resetAttachmentResourceResolutionCacheForTest() {
  attachmentResourceResolutionCache.clear();
  clearAttachmentResourceDescriptions();
}
