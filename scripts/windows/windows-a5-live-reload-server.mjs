/* global URL, clearTimeout, setTimeout */

import path from 'node:path';

import { createServer } from 'vite';

export const WINDOWS_A5_LIVE_RELOAD_PORT = 24605;
export const WINDOWS_A5_LIVE_RELOAD_URL = `http://127.0.0.1:${WINDOWS_A5_LIVE_RELOAD_PORT}`;

const LOADED_PATH = '/__foliole_a5_dev_loaded__';
const IDENTITY_PATTERN = /^[A-Za-z0-9.-]{1,96}$/u;

function liveReloadError(message, stage = 'live-server') {
  return Object.assign(new Error(message), { exitCode: 74, stage });
}

function createLoadTracker(buildIdentity, now) {
  let latest = null;
  let sequence = 0;
  const waiters = [];
  return {
    record(request) {
      const url = new URL(request.url, WINDOWS_A5_LIVE_RELOAD_URL);
      if (url.searchParams.get('identity') !== buildIdentity) return false;
      latest = {
        buildIdentity, loadedAt: now().toISOString(), sequence: sequence += 1,
        userAgent: String(request.headers['user-agent'] || '').slice(0, 300)
      };
      for (const waiter of waiters.splice(0)) waiter(latest);
      return true;
    },
    wait(afterSequence, timeoutMs) {
      if (latest && latest.sequence > afterSequence) return Promise.resolve(latest);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.indexOf(onLoad);
          if (index >= 0) waiters.splice(index, 1);
          reject(liveReloadError('A5 did not load the current DEV build before timeout', 'live-load'));
        }, timeoutMs);
        const onLoad = (receipt) => { clearTimeout(timer); resolve(receipt); };
        waiters.push(onLoad);
      });
    }
  };
}

export function createA5LiveReloadPlugin({ buildIdentity, onDeviceLoad }) {
  const encodedIdentity = JSON.stringify(buildIdentity);
  return {
    name: 'foliole-a5-live-reload-identity',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(LOADED_PATH)) return next();
        const accepted = onDeviceLoad(request);
        response.statusCode = accepted ? 204 : 409;
        response.end();
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const script = [
          '(()=>{let observer=null;',
          `const identity=${encodedIdentity};`,
          "const ready=()=>Boolean(document.querySelector('[data-testid=\"companion-bottom-tab-bar\"]'));",
          `const report=()=>fetch('${LOADED_PATH}?identity='+encodeURIComponent(identity),`,
          "{cache:'no-store'}).catch(()=>{});",
          'const finish=()=>{observer?.disconnect();requestAnimationFrame(()=>requestAnimationFrame(report));};',
          "if(ready()){finish();return;}observer=new MutationObserver(()=>{if(ready())finish();});",
          "observer.observe(document.documentElement,{childList:true,subtree:true});})();"
        ].join('');
        return {
          html: html.replace('<script type="module" src="/@vite/client"></script>', ''),
          tags: [
            { attrs: { content: buildIdentity, name: 'foliole-a5-dev-build' }, tag: 'meta', injectTo: 'head' },
            { children: script, tag: 'script', injectTo: 'body' }
          ]
        };
      }
    }
  };
}

export async function startWindowsA5LiveReloadServer({
  buildIdentity,
  createServerImpl = createServer,
  now = () => new Date(),
  repoRoot,
  timeoutMs = 45_000
}) {
  if (!IDENTITY_PATTERN.test(buildIdentity || '')) throw liveReloadError('Invalid DEV build identity');
  const tracker = createLoadTracker(buildIdentity, now);
  const server = await createServerImpl({
    configFile: path.join(repoRoot, 'vite.companion.config.ts'),
    oxc: { target: 'chrome64' },
    plugins: [createA5LiveReloadPlugin({ buildIdentity, onDeviceLoad: tracker.record })],
    server: {
      hmr: false, host: '127.0.0.1', port: WINDOWS_A5_LIVE_RELOAD_PORT, strictPort: true
    }
  });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw liveReloadError(`Companion DEV server failed to become ready: ${error.message}`);
  }
  return {
    buildIdentity,
    close: () => server.close(),
    url: WINDOWS_A5_LIVE_RELOAD_URL,
    waitForDeviceLoad: (afterSequence = 0) => tracker.wait(afterSequence, timeoutMs)
  };
}
