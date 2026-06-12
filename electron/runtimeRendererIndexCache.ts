import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { RUNTIME_RENDERER_INDEX_CACHE_MARKER, resolveRuntimeRendererIndexPath } from './runtimeRendererHtml.js';

function extractLocalRendererAssetRefs(html: string) {
  return [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/giu)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

function resolveRuntimeRendererAssetPath(runtimeIndexPath: string, html: string, ref: string) {
  let url: URL;
  try {
    const baseHref = html.match(/<base\b[^>]*href=["']([^"']+)["']/iu)?.[1];
    url = new URL(ref, baseHref ?? pathToFileURL(runtimeIndexPath));
  } catch {
    return null;
  }
  return url.protocol === 'file:' ? fileURLToPath(url) : null;
}

function isRuntimeRendererIndexFresh(runtimeIndexPath: string, sourceIndexPath: string | null) {
  if (!sourceIndexPath) return true;
  try {
    return fs.statSync(runtimeIndexPath).mtimeMs >= fs.statSync(sourceIndexPath).mtimeMs;
  } catch {
    return false;
  }
}

function hasCurrentRuntimeRendererAssets(runtimeIndexPath: string, sourceIndexPath: string | null = null) {
  const html = readTextFile(runtimeIndexPath);
  if (!html) return false;
  if (!html.includes(RUNTIME_RENDERER_INDEX_CACHE_MARKER)) return false;
  if (!isRuntimeRendererIndexFresh(runtimeIndexPath, sourceIndexPath)) return false;
  return extractLocalRendererAssetRefs(html).every((ref) => {
    const assetPath = resolveRuntimeRendererAssetPath(runtimeIndexPath, html, ref);
    return assetPath === null || fs.existsSync(assetPath);
  });
}

function readTextFile(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function resolveUsableRuntimeRendererIndex(runtimeHtmlDir: string, sourceIndexPath: string | null = null) {
  const runtimeIndexPath = resolveRuntimeRendererIndexPath(runtimeHtmlDir);
  if (!fs.existsSync(runtimeIndexPath)) return null;
  if (hasCurrentRuntimeRendererAssets(runtimeIndexPath, sourceIndexPath)) return runtimeIndexPath;
  return null;
}
