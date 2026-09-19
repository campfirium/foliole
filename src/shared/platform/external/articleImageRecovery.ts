import { parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { invalidateAttachmentResourceResolution } from '../attachmentResources';
import { recoverCompanionArticleImage } from '../companion/runtime/companionArticleImageRecovery';
import { getCompanionRuntimeCapability } from '../companionRuntimeCapabilities';
import { getRuntimeInvoke } from '../runtimeInvoke';

const pending = new Map<string, Promise<{ content: string; storageKey: string } | null>>();

export function recoverMissingArticleImage(nodeId: string, source: string, content: string) {
  const storageKey = parseAssetMarkdownUrl(source);
  if (!storageKey) return Promise.resolve(null);
  const key = JSON.stringify([nodeId, storageKey, content]);
  const active = pending.get(key);
  if (active) return active;
  const operation = recover(nodeId, storageKey, content).finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

async function recover(nodeId: string, storageKey: string, content: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) {
    const runtime = getCompanionRuntimeCapability();
    const recovered = runtime.kind === 'android-native' || runtime.kind === 'ios-native'
      ? await recoverCompanionArticleImage(nodeId, storageKey, content) : null;
    if (recovered) {
      invalidateAttachmentResourceResolution(storageKey);
      invalidateAttachmentResourceResolution(recovered.storageKey);
    }
    return recovered;
  }
  const result = await invoke(NATIVE_COMMANDS.importRemoteImageAttachment, {
    expectedContent: content, nodeId, recoverStorageKey: storageKey, sourceUrl: ''
  });
  if (result.status !== 'imported' || result.recovered_content === undefined) return null;
  invalidateAttachmentResourceResolution(storageKey);
  invalidateAttachmentResourceResolution(result.storage_key);
  return { content: result.recovered_content, storageKey: result.storage_key };
}
