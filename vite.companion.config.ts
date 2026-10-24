import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import type { Plugin } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { companionPreviewServerPlugin } from './scripts/vite/companionPreviewServer';
import { createSharedViteConfig } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
// Tailwind's pre-color-mix fallback for `<channel color>/<alpha>` utilities double-wraps rgb() and is invalid.
const BROKEN_ALPHA_COLOR_FALLBACK =
  /color-mix\(in srgb,\s*rgb\(rgb\((var\(--[\w-]+\)) \/ 1\) \/ 1\) ([\d.]+%),\s*transparent\)/gu;

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

export function repairAlphaColorFallbacksForLegacyWebView(css: string) {
  const root = postcss.parse(css);
  root.walkDecls((declaration) => {
    declaration.value = declaration.value.replace(BROKEN_ALPHA_COLOR_FALLBACK, 'rgb($1 / $2)');
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
        asset.source = repairAlphaColorFallbacksForLegacyWebView(unwrapCssCascadeLayersForLegacyWebView(asset.source));
      }
    }
  };
}

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT, { pdfJsResources: true }),
  defineConfig({
    root: path.resolve(PROJECT_ROOT, 'src/companion'),
    plugins: [companionLegacyWebViewCssPlugin(), companionPreviewServerPlugin(PROJECT_ROOT)],
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist/companion'),
      target: 'chrome64',
      cssTarget: 'chrome64'
    }
  })
);
