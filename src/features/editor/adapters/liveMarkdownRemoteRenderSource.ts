import { buildRemoteImageRenderUrl } from '../../../../lib/platform/remoteImageProtocolUrl';
import { shouldAutoLocalizeRemoteImages } from '../model/remoteImageLocalizationSetting';

export function buildRemoteRenderSource(sourceUrl: string, editorNodeId: string | null, retryKey: string | null = null) {
  return buildRemoteImageRenderUrl({
    nodeId: editorNodeId,
    persist: shouldAutoLocalizeRemoteImages() && Boolean(editorNodeId),
    retryKey,
    sourceUrl
  });
}
