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
  for (const assetId of topic.attachmentIds ?? []) {
    const bytes = await fetchAssetBytes(assetId);
    if (!bytes) {
      continue;
    }
    await importClipboardImageAttachmentBytes({
      bytesBase64: encodeBytesToBase64(bytes),
      mimeType: 'image/png',
      nodeId,
      originalName: `${assetId}.png`
    });
  }
}
