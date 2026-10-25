import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface ReviewHistoryMutation {
  mode: 'undo' | 'redo';
  targetOpId: string;
}

export function reviewHistoryOpId(targetOpId: string, updatedAt: string, mode: 'undo' | 'redo') {
  return `evt_${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([targetOpId, updatedAt, mode]))))}`;
}
