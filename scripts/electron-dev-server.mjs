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

export const VITE_RENDERER_PREWARM_PATHS = [
  '/src/app/styles.css',
  '/src/main.tsx',
  '/@vite/client',
  '/lib/platform/managedInbox.ts'
];

const VITE_RENDERER_PREWARM_ATTEMPTS = 3;
const VITE_RENDERER_PREWARM_RETRY_DELAY_MS = 150;

function resolveViteResourceUrl(viteUrl, resourcePath) {
  return new URL(resourcePath, viteUrl.endsWith('/') ? viteUrl : `${viteUrl}/`).toString();
}

function wait(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function fetchPrewarmResource(fetchImpl, resourceUrl, resourcePath) {
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(resourceUrl, { method: 'GET' });
    return {
      durationMs: Math.round(performance.now() - startedAt),
      ok: response.ok,
      path: resourcePath,
      status: response.status
    };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      path: resourcePath
    };
  }
}

async function prewarmViteRendererEntry(viteUrl, fetchImpl, resourcePath) {
  const resourceUrl = resolveViteResourceUrl(viteUrl, resourcePath);
  let latestResult = null;
  for (let attempt = 0; attempt < VITE_RENDERER_PREWARM_ATTEMPTS; attempt += 1) {
    latestResult = await fetchPrewarmResource(fetchImpl, resourceUrl, resourcePath);
    if (latestResult.ok) {
      return latestResult;
    }
    if (attempt < VITE_RENDERER_PREWARM_ATTEMPTS - 1) {
      await wait(VITE_RENDERER_PREWARM_RETRY_DELAY_MS);
    }
  }
  return latestResult;
}

export async function prewarmViteRendererEntries(viteUrl, fetchImpl = globalThis.fetch) {
  return Promise.all(
    VITE_RENDERER_PREWARM_PATHS.map((resourcePath) => prewarmViteRendererEntry(viteUrl, fetchImpl, resourcePath))
  );
}
