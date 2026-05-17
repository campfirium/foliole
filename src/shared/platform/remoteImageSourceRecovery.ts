import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export interface RemoteImageSourceContextState {
  imageHost: string | null;
  learnedSourceOrigin: string | null;
  source: 'learned' | 'node' | 'none';
  sourceOrigin: string | null;
}

function normalizeContext(value: unknown): RemoteImageSourceContextState {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const source = payload.source === 'learned' || payload.source === 'node' ? payload.source : 'none';
  return {
    imageHost: typeof payload.image_host === 'string' ? payload.image_host : null,
    learnedSourceOrigin: typeof payload.learned_source_origin === 'string' ? payload.learned_source_origin : null,
    source,
    sourceOrigin: typeof payload.source_origin === 'string' ? payload.source_origin : null
  };
}

export async function loadRemoteImageSourceContext(sourceUrl: string, nodeId: string | null) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return normalizeContext(null);
  const result = await invoke(NATIVE_COMMANDS.loadRemoteImageSourceContext, {
    node_id: nodeId,
    source_url: sourceUrl
  });
  return normalizeContext(result);
}

export async function saveRemoteImageSourceWebsite(sourceUrl: string, sourceWebsite: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return false;
  const result = await invoke(NATIVE_COMMANDS.saveRemoteImageSourceOrigin, {
    source_url: sourceUrl,
    source_website: sourceWebsite
  });
  return Boolean(result && typeof result === 'object' && (result as { status?: unknown }).status === 'saved');
}

export async function forgetRemoteImageLearnedSource(sourceUrl: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return false;
  const result = await invoke(NATIVE_COMMANDS.forgetRemoteImageLearnedSource, {
    source_url: sourceUrl
  });
  return Boolean(result && typeof result === 'object' && (result as { status?: unknown }).status === 'forgotten');
}
