const EPUB_GENERATED_NODE_PREFIX = 'node-epub-';
const EPUB_GENERATED_NODE_HASH_LENGTH = 24;

export function createEpubGeneratedNodeId(stableHash: string) {
  return `${EPUB_GENERATED_NODE_PREFIX}${stableHash.slice(0, EPUB_GENERATED_NODE_HASH_LENGTH)}`;
}

export function isEpubGeneratedNodeId(nodeId: string) {
  return nodeId.startsWith(EPUB_GENERATED_NODE_PREFIX);
}
