import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin, Rollup } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { createWebGuidesManifest, WEB_GUIDES_MANIFEST_FILE, type WebGuidesRuntimeAsset } from './src/web-guides/webGuidesManifest';
import { createSharedViteConfig } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

function toRuntimeAsset(output: Rollup.OutputAsset | Rollup.OutputChunk): WebGuidesRuntimeAsset | null {
  if (output.type === 'chunk') return { path: output.fileName, type: 'script' };
  if (output.fileName.endsWith('.css')) return { path: output.fileName, type: 'style' };
  return null;
}

export function webGuidesManifestPlugin(): Plugin {
  return {
    name: 'web-guides-manifest',
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .map(toRuntimeAsset)
        .filter((asset): asset is WebGuidesRuntimeAsset => asset !== null);
      this.emitFile({
        type: 'asset',
        fileName: WEB_GUIDES_MANIFEST_FILE,
        source: `${JSON.stringify(createWebGuidesManifest({ assets }), null, 2)}\n`
      });
    }
  };
}

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT),
  defineConfig({
    root: path.resolve(PROJECT_ROOT, 'src/web-guides'),
    plugins: [webGuidesManifestPlugin()],
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist-guides')
    }
  })
);
