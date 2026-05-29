import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import type { Plugin } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { createSharedViteConfig } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

export function unwrapCssCascadeLayersForLegacyWebView(css: string) {
  const root = postcss.parse(css);
  root.walkAtRules('layer', (rule) => {
    if (!rule.nodes?.length) {
      rule.remove();
      return;
    }
    rule.replaceWith(...rule.nodes);
  });
  return root.toString();
}

function companionLegacyWebViewCssPlugin(): Plugin {
  return {
    name: 'companion-legacy-webview-css',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css') || typeof asset.source !== 'string') {
          continue;
        }
        asset.source = unwrapCssCascadeLayersForLegacyWebView(asset.source);
      }
    }
  };
}

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT),
  defineConfig({
    root: path.resolve(PROJECT_ROOT, 'src/companion'),
    plugins: [companionLegacyWebViewCssPlugin()],
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist/companion'),
      target: 'chrome64',
      cssTarget: 'chrome64'
    }
  })
);
