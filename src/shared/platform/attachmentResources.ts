import { Capacitor } from '@capacitor/core';

import { parseAssetMarkdownUrl } from '../../../lib/platform/assetMarkdownUrl';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeAttachmentResourceResolution } from '../../../lib/platform/nativeUtilityContract';
import { createBoundedCache } from '../lib/boundedCache';

import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
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

function parseAttachmentId(resourceUrl: string) {
  return parseAssetMarkdownUrl(resourceUrl);
}

export async function resolveRuntimeAttachmentResource(resourceUrl: string) {
  const attachmentId = parseAttachmentId(resourceUrl);
  if (!attachmentId) {
    return null;
  }

  if (isNativeAndroidCompanionRuntime()) {
    return resolveAndroidAttachmentResource(attachmentId);
  }

  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  const cached = attachmentResourceResolutionCache.get(attachmentId);
  if (cached) {
    updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: true });
    return cached;
  }

  const resolutionPromise = runtimeInvoke(NATIVE_COMMANDS.resolveAttachmentResource, { attachment_id: attachmentId })
    .then((result) => {
      if (!isAttachmentResourceResolution(result)) {
        logRuntimeWarning('native attachment resource payload invalid', {
          area: 'bridge',
          action: 'resolve_attachment_resource',
          command: NATIVE_COMMANDS.resolveAttachmentResource,
          attachment_id: attachmentId,
          fallback: 'return_null'
        });
        attachmentResourceResolutionCache.delete(attachmentId);
        return null;
      }
      return result;
    })
    .catch((error) => {
      logRuntimeWarning('native attachment resource resolve failed', {
        area: 'bridge',
        action: 'resolve_attachment_resource',
        command: NATIVE_COMMANDS.resolveAttachmentResource,
        attachment_id: attachmentId,
        fallback: 'return_null',
        error
      });
      attachmentResourceResolutionCache.delete(attachmentId);
      return null;
    });

  attachmentResourceResolutionCache.set(attachmentId, resolutionPromise);
  updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: false });
  return resolutionPromise;
}

async function resolveAndroidAttachmentResource(attachmentId: string) {
  const cached = attachmentResourceResolutionCache.get(attachmentId);
  if (cached) {
    updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: true });
    return cached;
  }

  const resolutionPromise = FolioleCompanionSync.resolveAttachmentResource({ attachment_id: attachmentId })
    .then((result) => normalizeAndroidAttachmentResolution(result, attachmentId))
    .catch((error) => {
      logRuntimeWarning('native Android attachment resource resolve failed', {
        area: 'bridge',
        action: 'resolve_attachment_resource',
        attachment_id: attachmentId,
        fallback: 'return_null',
        error
      });
      attachmentResourceResolutionCache.delete(attachmentId);
      return null;
    });

  attachmentResourceResolutionCache.set(attachmentId, resolutionPromise);
  updateImageCacheStats({ entries: attachmentResourceResolutionCache.size, hit: false });
  return resolutionPromise;
}

function normalizeAndroidAttachmentResolution(
  result: unknown,
  attachmentId: string
): NativeAttachmentResourceResolution | null {
  if (!isAttachmentResourceResolution(result)) {
    logRuntimeWarning('native Android attachment resource payload invalid', {
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
  attachmentResourceResolutionCache.delete(attachmentId);
}

export function resetAttachmentResourceResolutionCacheForTest() {
  attachmentResourceResolutionCache.clear();
}
