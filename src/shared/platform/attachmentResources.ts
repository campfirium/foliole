import { Capacitor } from '@capacitor/core';

import { parseAssetMarkdownUrl } from '../../../lib/platform/assetMarkdownUrl';
import { parseCanonicalAttachmentStorageKey } from '../../../lib/platform/attachmentResource';
import type { AttachmentResourceDescription } from '../../../lib/platform/attachmentResource';
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
const attachmentResourceResolutionsInFlight = new Map<
  string,
  Promise<NativeAttachmentResourceResolution | null>
>();

function trackAttachmentResourceResolution(
  storageKey: string,
  resolution: Promise<NativeAttachmentResourceResolution | null>
) {
  attachmentResourceResolutionsInFlight.set(storageKey, resolution);
  void resolution.finally(() => {
    if (attachmentResourceResolutionsInFlight.get(storageKey) === resolution) {
      attachmentResourceResolutionsInFlight.delete(storageKey);
    }
  }).catch(() => undefined);
  return resolution;
}

export async function resolveRuntimeAttachmentResource(
  resourceUrl: string, options?: { refresh?: boolean; imageDisplay?: boolean }
) {
  const storageKey = parseAssetMarkdownUrl(resourceUrl);
  const parsed = storageKey ? parseCanonicalAttachmentStorageKey(storageKey) : null;
  if (!storageKey || !parsed) return null;
  const runtime = getCompanionRuntimeCapability();
  const imageDisplay = options?.imageDisplay === true && runtime.kind === 'android-native' &&
    parsed.mimeType.startsWith('image/');
  const cacheKey = imageDisplay ? `image-display:${storageKey}` : storageKey;
  const inFlight = attachmentResourceResolutionsInFlight.get(cacheKey);
  if (inFlight) return inFlight;
  if (options?.refresh) attachmentResourceResolutionCache.delete(cacheKey);

  // The browser preview reads attachments copied with its library; it never downloads them.
  if (isNativeCompanionAttachmentResourceRuntime() || runtime.kind === 'browser-preview') {
    return trackAttachmentResourceResolution(cacheKey, resolveNativeAttachmentResource(parsed, cacheKey, imageDisplay));
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
  return trackAttachmentResourceResolution(storageKey, resolutionPromise);
}

async function resolveNativeAttachmentResource(
  description: Pick<AttachmentResourceDescription, 'contentHash' | 'mimeType' | 'storageKey'>,
  cacheKey: string,
  imageDisplay: boolean
) {
  const cached = attachmentResourceResolutionCache.get(cacheKey);
  if (cached) {
    updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: true });
    return cached;
  }

  const resolutionPromise = resolveNativeAttachmentResourceUncached(description, imageDisplay)
    .then((result) => normalizeNativeAttachmentResolution(result, description.storageKey, cacheKey))
    .catch((error) => {
      logRuntimeWarning('native companion attachment resource resolve failed', {
        area: 'bridge',
        action: 'resolve_attachment_resource',
        storage_key: description.storageKey,
        fallback: 'return_null',
        error
      });
      attachmentResourceResolutionCache.delete(cacheKey);
      return null;
    });

  attachmentResourceResolutionCache.set(cacheKey, resolutionPromise);
  updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: false });
  return resolutionPromise;
}

// Requests without image display stay strict: a PDF or an iOS image whose stored bytes do not match
// must resolve as missing so the viewer asks attachment sync to fetch a good copy.
async function resolveNativeAttachmentResourceUncached(
  description: Pick<AttachmentResourceDescription, 'contentHash' | 'mimeType' | 'storageKey'>,
  imageDisplay: boolean
) {
  return FolioleCompanionSync.resolveAttachmentResource({
    attachment_id: description.contentHash,
    content_hash: description.contentHash,
    mime_type: description.mimeType,
    storage_key: description.storageKey,
    ...(imageDisplay ? { image_display: true } : {})
  });
}

function normalizeNativeAttachmentResolution(
  result: unknown,
  storageKey: string,
  cacheKey: string
): NativeAttachmentResourceResolution | null {
  if (!isAttachmentResourceResolution(result)) {
    logRuntimeWarning('native companion attachment resource payload invalid', {
      area: 'bridge',
      action: 'resolve_attachment_resource',
      storage_key: storageKey,
      fallback: 'return_null'
    });
    attachmentResourceResolutionCache.delete(cacheKey);
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
  if (!directStorageKey) return;
  attachmentResourceResolutionCache.delete(directStorageKey);
  attachmentResourceResolutionCache.delete(`image-display:${directStorageKey}`);
}

export function resetAttachmentResourceResolutionCacheForTest() {
  attachmentResourceResolutionCache.clear();
  attachmentResourceResolutionsInFlight.clear();
}
