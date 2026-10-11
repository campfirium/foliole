import type { DbPort } from './dbPort.js';
import { collectRequestSyncBodies } from './requestSyncBodyRetention.js';

export interface NodeVersionCollectionResult {
  released: number;
  skipped: string | null;
}

/** Collect topic bodies using member positions, retaining every identity and parent edge. */
export function collectNodeVersionPayloads(port: DbPort, nodeId: string, limit = 32): Promise<NodeVersionCollectionResult> {
  return collectRequestSyncBodies(port, nodeId, limit);
}
