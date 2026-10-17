import type { ContentImageReference } from '../../../../lib/core/sync/localContentEditResources';
import { importClipboardImageAttachmentBytes } from '../../../shared/platform/attachmentImports';

import type { GuidedSampleTopicTemplate } from './guidedSampleContent';

function toAssetBaseUrl() {
  const baseUrl = import.meta.env.BASE_URL || './';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function toGuidedSampleAssetUrl(assetId: string) {
  return `${toAssetBaseUrl()}guided-sample-assets/${assetId}.png`;
}

async function fetchAssetBytes(assetId: string) {
  const response = await fetch(toGuidedSampleAssetUrl(assetId));
  if (!response.ok) {
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function importGuidedSampleTopicAssets(
  nodeId: string,
  topic: Pick<GuidedSampleTopicTemplate, 'attachmentIds'>
) {
  const references: ContentImageReference[] = [];
  for (const assetId of topic.attachmentIds ?? []) {
    const bytes = await fetchAssetBytes(assetId);
    if (!bytes) {
      continue;
    }
    const result = await importClipboardImageAttachmentBytes({
      bytesBase64: encodeBytesToBase64(bytes),
      mimeType: 'image/png',
      nodeId,
      originalName: `${assetId}.png`
    });
    if (result?.status === 'imported' && result.storage_key) references.push({
      storage_key: result.storage_key, original_name: result.original_name, role: 'image'
    });
  }
  return references;
}
