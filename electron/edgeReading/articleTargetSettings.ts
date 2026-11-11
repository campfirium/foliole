import { randomUUID } from 'node:crypto';
import { access, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';

import { app, dialog } from 'electron';

import type { ArticleTarget, ArticleTargetSettings } from '../../lib/platform/articleTarget.js';

import { discoverArticleTargets, resolveKnownArticleTarget, type LaunchTarget } from './articleTargetDiscovery.js';

const edge: ArticleTarget = { id: 'edge', name: 'Edge' };
const customId = 'custom';
type SavedTarget = ArticleTarget & { path?: string };

function preferencePath() {
  return join(app.getPath('userData'), 'article-target.json');
}

async function readTarget(): Promise<SavedTarget | null> {
  try {
    const saved = JSON.parse(await readFile(preferencePath(), 'utf8')) as Partial<SavedTarget> | null;
    if (typeof saved?.id === 'string' && typeof saved.name === 'string') return { id: saved.id, name: saved.name, ...(typeof saved.path === 'string' ? { path: saved.path } : {}) };
    return null;
  } catch {
    return null;
  }
}

async function saveTarget(target: SavedTarget) {
  const path = preferencePath();
  const temporary = path + '.' + randomUUID();
  try {
    await writeFile(temporary, JSON.stringify(target), { mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function resolveCustomTarget(target: SavedTarget): Promise<LaunchTarget | null> {
  const path = target.path;
  if (!path || !isAbsolute(path)) return null;
  const extension = extname(path).toLowerCase();
  const info = await stat(path).catch(() => null);
  const identity = { id: target.id, name: target.name };
  if (process.platform === 'darwin') {
    return extension === '.app' && info?.isDirectory() ? { ...identity, executable: '/usr/bin/open', args: ['-a', path] } : null;
  }
  if (!info?.isFile()) return null;
  if (process.platform === 'win32' && extension !== '.exe') return null;
  if (process.platform === 'linux' && extension === '.desktop') {
    if (!await access('/usr/bin/gio').then(() => true, () => false)) return null;
    return { ...identity, executable: '/usr/bin/gio', args: ['launch', path] };
  }
  return { ...identity, executable: path, args: [] };
}

export async function loadArticleTargets(): Promise<ArticleTargetSettings> {
  const [discovered, saved] = await Promise.all([discoverArticleTargets(app.getPath('home')), readTarget()]);
  const available = discovered.map(({ id, name }) => ({ id, name }));
  if (saved?.id === customId && await resolveCustomTarget(saved)) available.push({ id: saved.id, name: saved.name });
  const selected = saved ? { id: saved.id, name: saved.name } : available.find(({ id }) => id === edge.id) ?? null;
  return { selected, available };
}

async function pickTarget(): Promise<SavedTarget | null> {
  const filters = process.platform === 'win32' ? [{ name: 'Applications', extensions: ['exe'] }]
    : process.platform === 'darwin' ? [{ name: 'Applications', extensions: ['app'] }] : undefined;
  const picked = await dialog.showOpenDialog({
    properties: ['openFile'],
    ...(filters ? { filters } : {})
  });
  const path = picked.filePaths[0];
  if (picked.canceled || !path) return null;
  const name = basename(path).replace(/\.(?:app|exe|desktop)$/iu, '');
  const target = { id: customId, name, path };
  if (!await resolveCustomTarget(target)) throw new Error('invalid_article_target');
  return target;
}

export async function selectArticleTarget(id: string) {
  const target: SavedTarget | null = id === 'pick' ? await pickTarget() : await resolveKnownArticleTarget(id, app.getPath('home'));
  if (target) {
    const { id, name } = target;
    await saveTarget({ id, name, ...('path' in target && target.path ? { path: target.path } : {}) });
  }
  return loadArticleTargets();
}

export async function resolveSelectedArticleTarget() {
  const saved = await readTarget();
  if (saved?.id === customId) return resolveCustomTarget(saved);
  return resolveKnownArticleTarget(saved?.id ?? edge.id, app.getPath('home'));
}
