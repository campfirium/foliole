import { promises as fs } from 'node:fs';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeExportCurrentArticleMirrorResult } from '../../lib/platform/nativeUtilityContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { resolveArticleIdFromNodeId, sanitizePathSegment } from './exportArticleMirror.js';
import { renderMirrorPlan } from './mirrorOutputPlans.js';
import { captureArticleMirrorSnapshot, createMirrorPlanCurrency, mirrorPlanRevision } from './mirrorOutputSnapshot.js';

function loadExportArticle(nodeId: string) {
  const articleId = resolveArticleIdFromNodeId(nodeId);
  if (!articleId) return null;
  const row = openDatabaseConnection().driver.queryOne<{ title: string; deleted_at: string | null }>(
    'SELECT title, deleted_at FROM nodes WHERE id = ?', [articleId]);
  return row && !row.deleted_at ? { articleId, title: row.title } : null;
}

async function writeCurrentArticleMirror(articleId: string, outputPath: string): Promise<NativeExportCurrentArticleMirrorResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const job = await runWithDatabaseConnectionOwner(() => {
      const captured = captureArticleMirrorSnapshot(articleId);
      return captured ? { captured, currency: createMirrorPlanCurrency(captured) } : null;
    });
    if (!job) return { path: null, status: 'not_found' };
    const { snapshot, plan } = job.captured;
    const revision = mirrorPlanRevision(snapshot, plan);
    const markdown = await renderMirrorPlan(snapshot, plan);
    const written = await runWithDatabaseConnectionOwner(async () => {
      if (!job.currency.isPlanCurrent(articleId, revision)) return false;
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, markdown, 'utf8');
      return true;
    });
    if (written) return { path: outputPath, status: 'saved' };
  }
  return { path: null, status: 'save_failed' };
}

export async function exportCurrentArticleMirror(
  nodeId: string,
  window: BrowserWindow | null
): Promise<NativeExportCurrentArticleMirrorResult> {
  const article = await runWithDatabaseConnectionOwner(() => loadExportArticle(nodeId));
  if (!article) return { path: null, status: 'not_found' };
  const dialogOptions = {
    buttonLabel: 'Export article',
    defaultPath: `${sanitizePathSegment(article.title.trim() || 'Untitled')}.md`,
    filters: [{ extensions: ['md'], name: 'Markdown files' }],
    title: 'Export current article'
  };
  const selection = window
    ? await dialog.showSaveDialog(window, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);
  if (selection.canceled || !selection.filePath) return { path: null, status: 'cancelled' };
  try {
    return await writeCurrentArticleMirror(article.articleId, selection.filePath);
  } catch {
    return { path: null, status: 'save_failed' };
  }
}
