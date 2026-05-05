import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildDesktopSyncPack } from '../database/syncPackBuilder.js';

export const SYNC_PACK_PATH = '/companion/sync-pack';

export interface CompanionSyncPackResource {
  body?: Buffer;
  error?: string;
  fileName?: string;
  status: 'error' | 'ready';
  statusCode: number;
}

function parseStateSeq(value: string | null) {
  if (value == null || value.trim() === '') {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function buildCompanionSyncPackResource(parsedRequestUrl: URL): Promise<CompanionSyncPackResource> {
  const fromStateSeq = parseStateSeq(parsedRequestUrl.searchParams.get('after_state_seq'));
  if (fromStateSeq == null) {
    return { error: 'invalid_after_state_seq', status: 'error', statusCode: 400 };
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-'));
  const packId = randomUUID();
  const outputPath = path.join(tempRoot, `${packId}.syncpack`);
  try {
    await buildDesktopSyncPack({ fromStateSeq, outputPath, packId });
    return {
      body: await fs.readFile(outputPath),
      fileName: `${packId}.syncpack`,
      status: 'ready',
      statusCode: 200
    };
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
}
