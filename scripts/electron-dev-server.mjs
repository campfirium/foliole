import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';

export async function isViteServerReady(viteUrl, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(viteUrl, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

export const VITE_RENDERER_PREWARM_PATHS = ['/src/app/styles.css', '/src/main.tsx'];

function resolveViteResourceUrl(viteUrl, resourcePath) {
  return new URL(resourcePath, viteUrl.endsWith('/') ? viteUrl : `${viteUrl}/`).toString();
}

export async function prewarmViteRendererEntries(viteUrl, fetchImpl = globalThis.fetch) {
  const results = [];
  for (const resourcePath of VITE_RENDERER_PREWARM_PATHS) {
    const resourceUrl = resolveViteResourceUrl(viteUrl, resourcePath);
    try {
      const startedAt = performance.now();
      const response = await fetchImpl(resourceUrl, { method: 'GET' });
      results.push({
        durationMs: Math.round(performance.now() - startedAt),
        ok: response.ok,
        path: resourcePath,
        status: response.status
      });
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        path: resourcePath
      });
    }
  }
  return results;
}
