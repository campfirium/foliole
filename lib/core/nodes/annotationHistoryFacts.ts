import { hashTextBody } from '../database/textBodyHash.js';

export interface AnnotationHistoryFact {
  nodeId: string;
  parentNodeId: string | null;
  kind: string;
  contentHash: string;
  revealHash: string | null;
  anchorHash: string;
  imageRegionsHash: string;
}

export function hashAnnotationValue(value: unknown): string {
  return hashTextBody(JSON.stringify(normalize(value)));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => [key, normalize(item)]));
  return value ?? null;
}

export function captureAnnotationHistoryFact(node: {
  id: string; parentNodeId: string | null; kind: string; content: string; reveal: string | null;
  anchorLink?: unknown; imageRegions?: unknown;
}): AnnotationHistoryFact {
  return {
    nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind,
    contentHash: hashTextBody(node.content), revealHash: node.reveal === null ? null : hashTextBody(node.reveal),
    anchorHash: hashAnnotationValue(node.anchorLink), imageRegionsHash: hashAnnotationValue(node.imageRegions)
  };
}
