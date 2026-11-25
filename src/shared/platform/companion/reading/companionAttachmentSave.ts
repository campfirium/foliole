import { Capacitor, registerPlugin } from '@capacitor/core';

import { parseAssetMarkdownUrl } from '../../../../../lib/platform/assetMarkdownUrl';
import {
  buildCanonicalAttachmentStorageKey,
  parseCanonicalAttachmentStorageKey
} from '../../../../../lib/platform/attachmentResource';

export type CompanionAttachmentSaveStatus = 'saved' | 'cancelled' | 'unavailable';

const pluginName = 'FolioleArticleHandoff';
const nativeSave = registerPlugin<{
  saveAttachment(options: {
    storage_key: string;
    content_hash: string;
    mime_type: string;
    file_name: string;
  }): Promise<{ status: CompanionAttachmentSaveStatus }>;
}>(pluginName);

export function canSaveCompanionAttachment() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(pluginName);
}

export function companionAttachmentFileName(baseName: string | null | undefined, extension: string, fallback: string) {
  // eslint-disable-next-line no-control-regex
  const cleaned = (baseName ?? '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim()
    .replace(/^\.+/, '').slice(0, 120).trim();
  const name = cleaned || fallback;
  return name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension}`;
}

/** Finds the first library attachment referenced by one image's Markdown source. */
export function findCompanionImageStorageKey(markdown: string) {
  for (const match of markdown.matchAll(/asset:\/\/[^\s)>"']+/g)) {
    const storageKey = parseAssetMarkdownUrl(match[0]);
    const parsed = storageKey ? parseCanonicalAttachmentStorageKey(storageKey) : null;
    if (parsed?.mimeType.startsWith('image/')) return parsed.storageKey;
  }
  return null;
}

export function companionPdfStorageKey(attachmentId: string) {
  return buildCanonicalAttachmentStorageKey(attachmentId, 'application/pdf');
}

/** The caller resolves the attachment first; the native side saves the stored bytes. */
export async function saveCompanionAttachment(storageKey: string, baseName: string | null | undefined, fallbackName: string) {
  const parsed = parseCanonicalAttachmentStorageKey(storageKey);
  if (!parsed) return 'unavailable' as const;
  const result = await nativeSave.saveAttachment({
    storage_key: parsed.storageKey,
    content_hash: parsed.contentHash,
    mime_type: parsed.mimeType,
    file_name: companionAttachmentFileName(baseName, parsed.storageKey.slice(parsed.contentHash.length), fallbackName)
  });
  return result.status;
}
