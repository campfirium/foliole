import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, opendir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';

import type { LaunchTarget } from './articleTargetDiscovery.js';
import { resolveSelectedArticleTarget } from './articleTargetSettings.js';
import { renderEdgeReadingPage, type EdgeReadingArticle } from './edgeReadingPage.js';

const retentionMs = 24 * 60 * 60 * 1000;

async function removeExpiredPages(root: string) {
  const oldest = Date.now() - retentionMs;
  const directory = await opendir(root);
  for await (const entry of directory) {
    if (!entry.isDirectory() || !/^article-[A-Za-z0-9]{6}$/u.test(entry.name)) continue;
    const path = join(root, entry.name);
    const modified = await stat(path).then((info) => info.mtimeMs, () => null);
    if (modified !== null && modified < oldest) {
      await rm(path, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function openInTarget(target: LaunchTarget, path: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(target.executable, [...target.args, path], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    if (target.executable === '/usr/bin/open' || target.executable === '/usr/bin/gio') {
      child.once('close', (code) => code === 0 ? resolve() : reject(new Error('article_target_open_failed')));
    } else {
      child.once('spawn', () => { child.unref(); resolve(); });
    }
  });
}

export async function sendArticleToEdge(article: EdgeReadingArticle) {
  const target = await resolveSelectedArticleTarget();
  if (!target) throw new Error('article_target_unavailable');
  const root = join(app.getPath('temp'), 'Foliole', 'edge-read-aloud');
  await mkdir(root, { recursive: true, mode: 0o700 });
  await removeExpiredPages(root).catch(() => undefined);
  const directory = await mkdtemp(join(root, 'article-'));
  const path = join(directory, 'index.html');
  try {
    await writeFile(path, renderEdgeReadingPage(article), { mode: 0o600 });
    await openInTarget(target, path);
    return null;
  } catch {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw new Error('edge_article_open_failed');
  }
}
