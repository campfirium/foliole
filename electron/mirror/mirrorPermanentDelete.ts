import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { removeEmptyMirrorParents } from './mirrorOutputDirectory.js';
import { captureMirrorOutputSnapshot } from './mirrorOutputSnapshot.js';
import { removeMirrorFileAndLegacyDirectory, resolveAbsoluteMirrorPath } from './mirrorOutputStorage.js';
import { collectProtectedMirrorPaths } from './mirrorPathIdentity.js';

interface RetiredArticleMirror {
  articleId: string;
  databasePath: string;
  mirrorRoot: string;
  relativePath: string;
}

const pending = new Map<string, RetiredArticleMirror>();

/** Captured while the deletion task owns the database, before foreign-key cascade removes records. */
export function capturePermanentMirrorPaths(nodeIds: string[]): RetiredArticleMirror[] {
  if (!nodeIds.length) return [];
  const { driver, dbPath } = openDatabaseConnection();
  const mirrorRoot = loadLibraryPathSettingsSync().mirror;
  const rows = driver.queryAll<{ article_id: string; relative_path: string }>(
    `SELECT article_id, relative_path FROM mirror_articles WHERE article_id IN (${nodeIds.map(() => '?').join(',')})`, nodeIds
  );
  return rows.map((row) => ({ articleId: row.article_id, relativePath: row.relative_path, databasePath: dbPath, mirrorRoot }));
}

export async function retirePermanentMirrorPaths(mirrors: RetiredArticleMirror[]) {
  for (const mirror of mirrors) pending.set(JSON.stringify(mirror), mirror);
  await flushPermanentMirrorRetirements();
}

/** Failed filesystem work stays available for an explicit retry or the existing exit flush. */
export async function flushPermanentMirrorRetirements() {
  if (!pending.size) return;
  await runWithDatabaseConnectionOwner(async () => {
    const { dbPath, driver } = openDatabaseConnection();
    const mirrorRoot = loadLibraryPathSettingsSync().mirror;
    const eligible = [...pending].filter(([, mirror]) => mirror.databasePath === dbPath && mirror.mirrorRoot === mirrorRoot);
    if (!eligible.length) return;
    const captured = captureMirrorOutputSnapshot(false);
    const protectedPaths = collectProtectedMirrorPaths([
      ...captured.plans.map((plan) => plan.targetPath),
      ...[...captured.recordsByArticleId.values()].map((record) =>
        resolveAbsoluteMirrorPath(mirrorRoot, record.relativePath))
    ]);
    for (const [key, mirror] of eligible) {
      if (!driver.queryOne('SELECT id FROM nodes WHERE id = ?', [mirror.articleId])) {
        const filePath = resolveAbsoluteMirrorPath(mirrorRoot, mirror.relativePath);
        await removeMirrorFileAndLegacyDirectory(filePath, protectedPaths);
        await removeEmptyMirrorParents(filePath, mirrorRoot);
      }
      pending.delete(key);
    }
  });
}
