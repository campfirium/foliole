import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RENDERER_STALE_ALLOW_ENV = 'FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER';
const SOURCE_EXTENSIONS = new Set(['.cjs', '.css', '.html', '.js', '.json', '.jsx', '.mjs', '.svg', '.ts', '.tsx']);
const SOURCE_FILES = ['index.html', 'package-lock.json', 'package.json', 'vite.config.ts'];
const SOURCE_ROOTS = ['src', path.join('lib', 'core'), path.join('lib', 'platform')];
const SOURCE_SKIP_DIRS = new Set(['.git', '.tmp', 'dist', 'electron-dist', 'logs', 'node_modules']);

function isSourceCandidate(filePath) {
  const basename = path.basename(filePath);
  return (
    !basename.includes('.test.') &&
    !basename.includes('.spec.') &&
    !basename.endsWith('.d.ts') &&
    SOURCE_EXTENSIONS.has(path.extname(filePath))
  );
}

function findNewestSource(rootPath) {
  let newest = null;
  if (!fs.existsSync(rootPath)) {
    return newest;
  }
  const stack = [rootPath];
  while (stack.length > 0) {
    const currentPath = stack.pop();
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!SOURCE_SKIP_DIRS.has(entry.name)) stack.push(entryPath);
      } else if (entry.isFile() && isSourceCandidate(entryPath)) {
        const mtimeMs = fs.statSync(entryPath).mtimeMs;
        if (!newest || mtimeMs > newest.mtimeMs) newest = { filePath: entryPath, mtimeMs };
      }
    }
  }
  return newest;
}

function resolveNewestSource(appRoot) {
  const candidates = [];
  for (const sourceFile of SOURCE_FILES) {
    const filePath = path.join(appRoot, sourceFile);
    if (fs.existsSync(filePath)) candidates.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
  }
  for (const sourceRoot of SOURCE_ROOTS) {
    const newest = findNewestSource(path.join(appRoot, sourceRoot));
    if (newest) candidates.push(newest);
  }
  return candidates.reduce((newest, candidate) => (!newest || candidate.mtimeMs > newest.mtimeMs ? candidate : newest), null);
}

function relativePath(appRoot, filePath) {
  return path.relative(appRoot, filePath).replace(/\\/g, '/');
}

export function getRendererDistFreshness(target) {
  const newestSource = resolveNewestSource(target.appRoot);
  if (!fs.existsSync(target.rendererIndexPath)) {
    return { newestSource, rendererDistMtimeMs: null, stale: true };
  }
  const rendererDistMtimeMs = fs.statSync(target.rendererIndexPath).mtimeMs;
  return {
    newestSource,
    rendererDistMtimeMs,
    stale: Boolean(newestSource && newestSource.mtimeMs > rendererDistMtimeMs + 100)
  };
}

export function assertRendererDistFresh(target, env = process.env) {
  if (env[RENDERER_STALE_ALLOW_ENV]?.trim() === '1') {
    return;
  }
  const freshness = getRendererDistFreshness(target);
  if (!freshness.stale) {
    return;
  }
  const sourcePath = freshness.newestSource ? relativePath(target.appRoot, freshness.newestSource.filePath) : 'renderer source';
  throw new Error(
    [
      `stale renderer build output: ${relativePath(target.appRoot, target.rendererIndexPath)} is older than ${sourcePath}.`,
      'Run `npm run desktop:test:windows -- <spec>` so Windows dist is rebuilt before Playwright.',
      `For explicit diagnostics only, refresh dist manually or set ${RENDERER_STALE_ALLOW_ENV}=1.`
    ].join(' ')
  );
}
