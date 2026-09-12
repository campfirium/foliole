import { buildRemoteImageRenderUrl } from '../../../../lib/platform/remoteImageProtocolUrl';
import {
  loadRemoteImageSourceContext,
  type RemoteImageSourceContextState
} from '../../../shared/platform/remoteImageSourceRecovery';
import { shouldAutoLocalizeRemoteImages } from '../model/remoteImageLocalizationSetting';

const EMPTY_SOURCE_CONTEXT: RemoteImageSourceContextState = {
  imageHost: null,
  learnedSourceOrigin: null,
  source: 'none',
  sourceOrigin: null
};

export async function resolveRemoteRenderSourceContext(sourceUrl: string, editorNodeId: string | null) {
  return loadRemoteImageSourceContext(sourceUrl, editorNodeId).catch(() => EMPTY_SOURCE_CONTEXT);
}

export function buildRemoteRenderSource(
  sourceUrl: string,
  editorNodeId: string | null,
  sourceContext: RemoteImageSourceContextState,
  retryKey: string | null = null
) {
  return buildRemoteImageRenderUrl({
    nodeId: editorNodeId,
    persist: shouldAutoLocalizeRemoteImages() && Boolean(editorNodeId),
    retryKey,
    sourceOrigin: sourceContext.sourceOrigin,
    sourceProvenance: sourceContext.source,
    sourceUrl
  });
}
