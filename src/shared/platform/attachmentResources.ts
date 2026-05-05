import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeAttachmentResourceResolution } from '../../../lib/platform/nativeUtilityContract';

import { getRuntimeInvoke } from './bridge';
import { logRuntimeWarning } from './runtimeLogging';

const ATTACHMENT_RESOURCE_SCHEME = 'attachment://';

function isAttachmentResourceResolution(value: unknown): value is NativeAttachmentResourceResolution {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.status === 'ready' || candidate.status === 'not_found' || candidate.status === 'missing_file';
}

export function parseAttachmentId(resourceUrl: string) {
  if (!resourceUrl.startsWith(ATTACHMENT_RESOURCE_SCHEME)) {
    return null;
  }

  const encodedAttachmentId = resourceUrl.slice(ATTACHMENT_RESOURCE_SCHEME.length).trim();
  if (!encodedAttachmentId) {
    return null;
  }

  try {
    return decodeURIComponent(encodedAttachmentId);
  } catch {
    return encodedAttachmentId;
  }
}

export async function resolveRuntimeAttachmentResource(resourceUrl: string) {
  const attachmentId = parseAttachmentId(resourceUrl);
  if (!attachmentId) {
    return null;
  }

  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.resolveAttachmentResource, { attachment_id: attachmentId });
    if (!isAttachmentResourceResolution(result)) {
      logRuntimeWarning('native attachment resource payload invalid', {
        area: 'bridge',
        action: 'resolve_attachment_resource',
        command: NATIVE_COMMANDS.resolveAttachmentResource,
        attachment_id: attachmentId,
        fallback: 'return_null'
      });
      return null;
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native attachment resource resolve failed', {
      area: 'bridge',
      action: 'resolve_attachment_resource',
      command: NATIVE_COMMANDS.resolveAttachmentResource,
      attachment_id: attachmentId,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
