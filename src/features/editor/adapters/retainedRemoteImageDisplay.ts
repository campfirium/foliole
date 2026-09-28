import { collectImageMatches } from '../model/markdownImageMatches';

import type { LocalizedImageChange } from './localizeRemoteMarkdownImages';

const renderedSourcesByNode = new Map<string, Map<string, string>>();
const displaySourcesByNode = new Map<string, Map<string, string>>();

export function recordDisplayedRemoteImageSource(nodeId: string, source: string, renderUrl: string) {
  if (!/^https?:\/\//u.test(source) || !renderUrl.startsWith('foliole-remote-image://')) return;
  const sources = renderedSourcesByNode.get(nodeId) ?? new Map<string, string>();
  sources.set(source, renderUrl);
  renderedSourcesByNode.set(nodeId, sources);
}

export function retainDisplayedRemoteImageSources(
  nodeId: string | null,
  contentSnapshot: string,
  changes: LocalizedImageChange[]
) {
  if (!nodeId) return;
  const sources = displaySourcesByNode.get(nodeId) ?? new Map<string, string>();
  for (const change of changes) {
    const assetSource = collectImageMatches(0, change.insert)[0]?.source;
    const remoteSource = collectImageMatches(0, contentSnapshot.slice(change.from, change.to))[0]?.source;
    const renderUrl = remoteSource ? renderedSourcesByNode.get(nodeId)?.get(remoteSource) : null;
    if (assetSource?.startsWith('asset://') && renderUrl) sources.set(assetSource, renderUrl);
  }
  displaySourcesByNode.set(nodeId, sources);
}

export function getRetainedRemoteImageSource(nodeId: string | null, assetSource: string) {
  return nodeId ? displaySourcesByNode.get(nodeId)?.get(assetSource) ?? null : null;
}

export function clearRetainedRemoteImageSources(nodeId: string | null) {
  if (!nodeId) return;
  renderedSourcesByNode.delete(nodeId);
  displaySourcesByNode.delete(nodeId);
}
