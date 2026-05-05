import { promises as fs } from 'node:fs';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { NativeExportCurrentArticleMirrorResult } from '../../lib/platform/nativeUtilityContract.js';

import {
  loadArticleNode,
  renderArticleMirrorMarkdown,
  resolveArticleIdFromNodeId,
  sanitizePathSegment
} from './exportArticleMirror.js';

export async function exportCurrentArticleMirror(
  nodeId: string,
  window: BrowserWindow | null
): Promise<NativeExportCurrentArticleMirrorResult> {
  const articleId = resolveArticleIdFromNodeId(nodeId);
  if (!articleId) {
    return { path: null, status: 'not_found' };
  }

  const articleRow = loadArticleNode(articleId);
  if (!articleRow || articleRow.deleted_at) {
    return { path: null, status: 'not_found' };
  }

  const dialogOptions = {
    buttonLabel: 'Export article',
    defaultPath: `${sanitizePathSegment(articleRow.title.trim() || 'Untitled')}.md`,
    filters: [{ extensions: ['md'], name: 'Markdown files' }],
    title: 'Export current article'
  };
  const selection = window
    ? await dialog.showSaveDialog(window, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (selection.canceled || !selection.filePath) {
    return { path: null, status: 'cancelled' };
  }

  try {
    await fs.mkdir(path.dirname(selection.filePath), { recursive: true });
    await fs.writeFile(selection.filePath, renderArticleMirrorMarkdown(articleRow), 'utf8');
    return { path: selection.filePath, status: 'saved' };
  } catch {
    return { path: null, status: 'save_failed' };
  }
}
