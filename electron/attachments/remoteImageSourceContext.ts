import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';

import {
  loadRemoteImageLearnedSource,
  normalizeRemoteImageSourceOrigin
} from './remoteImageLearnedSources.js';

export interface RemoteImageSourceContext {
  imageHost: string | null;
  learnedSourceOrigin: string | null;
  source: 'learned' | 'node' | 'none';
  sourceOrigin: string | null;
}

function extractFrontmatterUrl(content: string | null | undefined) {
  const lines = (content ?? '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') {
    return null;
  }
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '---') {
      return null;
    }
    const match = /^(?:url|source_url|link):\s*(.+?)\s*$/.exec(line.trim());
    if (match?.[1]) {
      return match[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return null;
}

export function resolveRemoteImageSourceOriginForNode(nodeId: string | null) {
  const normalizedNodeId = nodeId?.trim() ?? '';
  if (!normalizedNodeId) {
    return null;
  }
  const details = loadNodeSourceDetails(normalizedNodeId);
  if (!details) {
    return null;
  }
  return (
    normalizeRemoteImageSourceOrigin(details.importSource?.source_locator) ??
    details.importRuns.map((entry) => normalizeRemoteImageSourceOrigin(entry.source_locator)).find(Boolean) ??
    normalizeRemoteImageSourceOrigin(extractFrontmatterUrl(details.sourceNodeContent)) ??
    null
  );
}

export function resolveRemoteImageSourceContext(nodeId: string | null, sourceUrl: string): RemoteImageSourceContext {
  const nodeSourceOrigin = resolveRemoteImageSourceOriginForNode(nodeId);
  const learned = loadRemoteImageLearnedSource(sourceUrl);
  if (nodeSourceOrigin) {
    return {
      imageHost: learned.imageHost,
      learnedSourceOrigin: learned.sourceOrigin,
      source: 'node',
      sourceOrigin: nodeSourceOrigin
    };
  }
  if (learned.sourceOrigin) {
    return {
      imageHost: learned.imageHost,
      learnedSourceOrigin: learned.sourceOrigin,
      source: 'learned',
      sourceOrigin: learned.sourceOrigin
    };
  }
  return {
    imageHost: learned.imageHost,
    learnedSourceOrigin: null,
    source: 'none',
    sourceOrigin: null
  };
}
