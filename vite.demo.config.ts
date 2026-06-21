import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin, Rollup } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { createDemoManifest, DEMO_MANIFEST_FILE, type DemoRuntimeAsset } from './src/demo/demoManifest';
import { createSharedViteConfig } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEMO_CANONICAL_ROUTE_PATTERN = /^\/(?:en|zh-hans)\/demo\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

function toRuntimeAsset(output: Rollup.OutputAsset | Rollup.OutputChunk): DemoRuntimeAsset | null {
  if (output.type === 'chunk') return { path: output.fileName, type: 'script' };
  if (output.fileName.endsWith('.css')) return { path: output.fileName, type: 'style' };
  return null;
}

export function demoManifestPlugin(): Plugin {
  return {
    name: 'demo-manifest',
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .map(toRuntimeAsset)
        .filter((asset): asset is DemoRuntimeAsset => asset !== null);
      this.emitFile({
        type: 'asset',
        fileName: DEMO_MANIFEST_FILE,
        source: `${JSON.stringify(createDemoManifest({ assets }), null, 2)}\n`
      });
    }
  };
}

export function isDemoCanonicalRoutePath(pathname: string) {
  return DEMO_CANONICAL_ROUTE_PATTERN.test(pathname);
}

export function normalizeDemoCanonicalRouteHtml(html: string) {
  return html.replace('src="./main.tsx"', 'src="/main.tsx"');
}

export function demoCanonicalRouteDevPlugin(): Plugin {
  return {
    name: 'demo-canonical-route-dev',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next();
          return;
        }
        const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
        if (!isDemoCanonicalRoutePath(pathname)) {
          next();
          return;
        }
        const indexPath = path.join(server.config.root, 'index.html');
        const html = await fs.readFile(indexPath, 'utf8');
        const transformed = normalizeDemoCanonicalRouteHtml(await server.transformIndexHtml('/index.html', html));
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(request.method === 'HEAD' ? '' : transformed);
      });
    }
  };
}

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT),
  defineConfig({
    base: '/assets/demo/',
    root: path.resolve(PROJECT_ROOT, 'src/demo'),
    plugins: [demoManifestPlugin(), demoCanonicalRouteDevPlugin()],
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist/demo')
    }
  })
);
