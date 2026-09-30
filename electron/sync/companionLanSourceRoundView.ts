import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';
import { createSyncPackSourceView, openSyncPackSourceView } from '../database/syncPackSourceView.js';

import { sessionRoot } from './companionLanDependencySession.js';

interface SourceRound {
  groupId: string;
  peerId: string;
  frontierStateSeq: number;
  sourceEpoch: string;
}

const roundRoot = (scope: Pick<SourceRound, 'groupId' | 'peerId'>) =>
  path.join(sessionRoot(scope.groupId, scope.peerId), '.round-source');

export function openCompanionSourceRoundView(scope: SourceRound) {
  const sourcePath = path.join(roundRoot(scope), 'source.db');
  if (!existsSync(sourcePath)) return null;
  const view = openSyncPackSourceView(sourcePath);
  if (view.sourceEpoch === scope.sourceEpoch &&
      view.frontierStateSeq === scope.frontierStateSeq) return view;
  view.close();
  return null;
}

export async function getOrCreateCompanionSourceRoundView(scope: SourceRound, freshRound = false) {
  const existing = freshRound ? null : openCompanionSourceRoundView(scope);
  if (existing) return existing;
  const parent = sessionRoot(scope.groupId, scope.peerId);
  await fs.mkdir(parent, { recursive: true });
  const staged = await fs.mkdtemp(path.join(parent, '.round-preparing-'));
  try {
    const view = await createSyncPackSourceView(openDatabaseConnection().sqlite,
      path.join(staged, 'source.db'));
    try {
      if (view.sourceEpoch !== scope.sourceEpoch ||
          view.frontierStateSeq !== scope.frontierStateSeq) {
        throw new Error('sync_pack_source_view_unavailable');
      }
    } finally { view.close(); }
    await fs.rm(roundRoot(scope), { recursive: true, force: true });
    await fs.rename(staged, roundRoot(scope));
    return openSyncPackSourceView(path.join(roundRoot(scope), 'source.db'));
  } finally { await fs.rm(staged, { recursive: true, force: true }); }
}

export async function markCompanionSourceRoundFinalPack(scope: SourceRound,
  packId: string, toStateSeq: number) {
  if (toStateSeq !== scope.frontierStateSeq || !/^[a-f0-9-]{36}$/u.test(packId)) return;
  const view = openCompanionSourceRoundView(scope);
  if (!view) return;
  view.close();
  const markers = path.join(roundRoot(scope), 'final-packs');
  await fs.mkdir(markers, { recursive: true });
  await fs.writeFile(path.join(markers, packId), '', { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
}

export async function releaseCompanionSourceRoundOnReceipt(groupId: string, peerId: string,
  packId: string) {
  if (!/^[a-f0-9-]{36}$/u.test(packId)) return;
  const scope = { groupId, peerId };
  try { await fs.access(path.join(roundRoot(scope), 'final-packs', packId)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await fs.rm(roundRoot(scope), { recursive: true, force: true });
}
