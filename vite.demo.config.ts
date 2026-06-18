import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin, Rollup } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { createDemoManifest, DEMO_MANIFEST_FILE, type DemoRuntimeAsset } from './src/demo/demoManifest';
import { createSharedViteConfig } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

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

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT),
  defineConfig({
    base: '/demo-runtime/',
    root: path.resolve(PROJECT_ROOT, 'src/demo'),
    plugins: [demoManifestPlugin()],
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist/demo')
    }
  })
);
