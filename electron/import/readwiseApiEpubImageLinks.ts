import type { NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { replaceNodeImageResourceReferences } from '../database/nodeResources.js';

export function replaceReadwiseApiEpubImageLinks(nodeId: string, references: readonly NodeResourceReference[]) {
  replaceNodeImageResourceReferences(nodeId, references);
}
