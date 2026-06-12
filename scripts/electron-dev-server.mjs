/* global console */

import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';

export async function isViteServerReady(viteUrl, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(viteUrl, { method: 'GET' });
    if (response.ok) {
      return true;
    }
    const clientResponse = await fetchImpl(resolveViteResourceUrl(viteUrl, '/@vite/client'), { method: 'GET' });
    return clientResponse.ok;
  } catch {
    return false;
  }
}

export const VITE_RENDERER_PREWARM_PATHS = [
  '/src/app/styles.css',
  '/src/main.tsx',
  '/src/app/App.tsx',
  '/@vite/client',
  '/lib/platform/managedInbox.ts'
];

const VITE_RENDERER_PREWARM_ATTEMPTS = 3;
const VITE_RENDERER_PREWARM_RETRY_DELAY_MS = 150;
const DEFAULT_PREWARM_STARTUP_BUDGET_MS = 2500;

function resolveViteResourceUrl(viteUrl, resourcePath) {
  return new URL(resourcePath, viteUrl.endsWith('/') ? viteUrl : `${viteUrl}/`).toString();
}

function wait(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function fetchPrewarmResource(fetchImpl, resourceUrl, resourcePath, options = {}) {
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(resourceUrl, {
      method: 'GET',
      ...(options.signal ? { signal: options.signal } : {})
    });
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

async function prewarmViteRendererEntry(viteUrl, fetchImpl, resourcePath, options = {}) {
  const resourceUrl = resolveViteResourceUrl(viteUrl, resourcePath);
  let latestResult = null;
  for (let attempt = 0; attempt < VITE_RENDERER_PREWARM_ATTEMPTS; attempt += 1) {
    latestResult = await fetchPrewarmResource(fetchImpl, resourceUrl, resourcePath, options);
    if (latestResult.ok) {
      return latestResult;
    }
    if (options.signal?.aborted) {
      return latestResult;
    }
    if (attempt < VITE_RENDERER_PREWARM_ATTEMPTS - 1) {
      await wait(VITE_RENDERER_PREWARM_RETRY_DELAY_MS);
    }
  }
  return latestResult;
}

export async function prewarmViteRendererEntries(viteUrl, fetchImpl = globalThis.fetch, options = {}) {
  return Promise.all(
    VITE_RENDERER_PREWARM_PATHS.map((resourcePath) => prewarmViteRendererEntry(viteUrl, fetchImpl, resourcePath, options))
  );
}

function formatPrewarmResult(result) {
  const detail = `path=${result.path} durationMs=${result.durationMs} ok=${result.ok}`;
  if (typeof result.status === 'number') {
    return `${detail} status=${result.status}`;
  }
  if (result.error) {
    return `${detail} error=${result.error}`;
  }
  return detail;
}

function logPrewarmResults(logger, prewarmResults, totalDurationMs) {
  const failedPrewarmResults = prewarmResults.filter((result) => !result.ok);
  const status = failedPrewarmResults.length > 0 ? 'incomplete' : 'complete';
  logger.info(
    `[electron-dev] startup timing prewarm_${status} totalDurationMs=${totalDurationMs} resources=${prewarmResults.length}`
  );
  for (const result of prewarmResults) {
    logger.info(`[electron-dev] startup timing prewarm_resource ${formatPrewarmResult(result)}`);
  }
}

export async function waitForPrewarmStartupBudget(
  prewarmPromise,
  {
    abortController = null,
    budgetMs = DEFAULT_PREWARM_STARTUP_BUDGET_MS,
    logger = console,
    now = performance.now.bind(performance)
  } = {}
) {
  const startedAt = now();
  logger.info(`[electron-dev] startup timing prewarm_start budgetMs=${budgetMs}`);
  const prewarmResults = await Promise.race([
    prewarmPromise,
    wait(budgetMs).then(() => null)
  ]);
  const elapsedMs = Math.round(now() - startedAt);
  if (prewarmResults) {
    logPrewarmResults(logger, prewarmResults, elapsedMs);
    return { elapsedMs, status: 'completed-before-launch' };
  }
  logger.warn(`[electron-dev] startup timing prewarm_timeout elapsedMs=${elapsedMs} budgetMs=${budgetMs}`);
  if (abortController && !abortController.signal.aborted) {
    abortController.abort();
    logger.warn('[electron-dev] startup timing prewarm_abort reason=startup-budget-timeout');
  }
  prewarmPromise
    .then((results) => {
      logPrewarmResults(logger, results, Math.round(now() - startedAt));
    })
    .catch((error) => {
      logger.warn('[electron-dev] startup timing prewarm_failed_after_launch', error);
    });
  return { elapsedMs, status: 'timeout-launch-electron' };
}
