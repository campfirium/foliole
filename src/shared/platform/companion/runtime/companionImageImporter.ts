import { classifyAttachmentBytes } from '../../../../../lib/platform/attachmentByteClassification';
import { buildCanonicalAttachmentStorageKey } from '../../../../../lib/platform/attachmentResource';
import { REMOTE_IMAGE_MAX_BYTES, REMOTE_IMAGE_MAX_REDIRECTS } from '../../../../../lib/platform/remoteImageResourceContract';
import { isAllowedRemoteImageHostname } from '../../../../../lib/platform/remoteImageUrlGuard';
import { requireAvailableCompanionRuntime } from '../../companionRuntimeCapabilities';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

function safeUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !isAllowedRemoteImageHostname(url.hostname)) throw new Error('remote_image_url_rejected');
  return url.toString();
}

async function downloadImage(sourceUrl: string) {
  let url = safeUrl(sourceUrl);
  for (let redirect = 0; redirect <= REMOTE_IMAGE_MAX_REDIRECTS; redirect += 1) {
    const response = await FolioleCompanionSync.readRemoteImageResponse({ url });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
      url = safeUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300 || !response.bytesBase64) {
      throw new Error('remote_image_download_failed');
    }
    const raw = atob(response.bytesBase64);
    if (!raw.length || raw.length > REMOTE_IMAGE_MAX_BYTES) throw new Error('remote_image_size_rejected');
    return { bytes: Uint8Array.from(raw, (value) => value.charCodeAt(0)), bytesBase64: response.bytesBase64 };
  }
  throw new Error('remote_image_redirect_limit');
}

export async function importCompanionImageResource(sourceUrl: string) {
  requireAvailableCompanionRuntime('remote-image-import');
  const { bytes, bytesBase64 } = await downloadImage(sourceUrl);
  const mimeType = classifyAttachmentBytes(bytes);
  if (!mimeType.startsWith('image/')) throw new Error('remote_image_type_rejected');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const contentHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const storageKey = buildCanonicalAttachmentStorageKey(contentHash, mimeType);
  if (!storageKey) throw new Error('remote_image_identity_rejected');
  const stored = await FolioleCompanionSync.writeImageAttachment({ bytesBase64, contentHash, mimeType, storageKey });
  return { contentHash, mimeType, sizeBytes: bytes.length, storageKey, storedFile: stored.storedFile };
}
