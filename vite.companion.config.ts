import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import type { Plugin } from 'vite';
import { defineConfig, mergeConfig } from 'vite';

import { createCapacitorConfig } from './capacitor.config';
import { companionPreviewServerPlugin } from './scripts/vite/companionPreviewServer';
import { companionTextScaleCss } from './scripts/vite/companionTextScaleCss';
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

function resolveCompanionSourceRevision() {
  const suppliedRevision = process.env.VITE_FOLIOLE_SOURCE_REVISION;
  if (suppliedRevision && /^[a-f0-9]{40}$/u.test(suppliedRevision)) return suppliedRevision;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return 'unidentified';
  }
}

function resolveAdoptionPerformanceLabel() {
  const label = process.env.FOLIOLE_SYNC_PERFORMANCE_LABEL;
  const isAcceptance = process.env.FOLIOLE_A5_APP_IDENTITY === 'test'
    && process.env.FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID === 'com.campfirium.foliole.android.acceptance';
  return isAcceptance && label && /^[a-zA-Z0-9_-]{1,64}$/u.test(label) ? label : '';
}

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT, { pdfJsResources: true }),
  defineConfig({
    define: {
      'import.meta.env.VITE_FOLIOLE_SOURCE_REVISION': JSON.stringify(resolveCompanionSourceRevision()),
      'import.meta.env.VITE_FOLIOLE_ADOPTION_PERFORMANCE_LABEL': JSON.stringify(resolveAdoptionPerformanceLabel())
    },
    root: path.resolve(PROJECT_ROOT, 'src/companion'),
    plugins: [
      companionLegacyWebViewCssPlugin(),
      companionPreviewServerPlugin(PROJECT_ROOT),
      {
        name: 'companion-android-startup-requirement',
        transformIndexHtml: html => html.replace(
          '__FOLIOLE_ANDROID_WEBVIEW_MINIMUM__',
          String(createCapacitorConfig().android?.minWebViewVersion ?? '')
        )
      }
    ],
    css: { postcss: { plugins: [companionTextScaleCss(), autoprefixer()] } },
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist/companion'),
      target: ['chrome125', 'safari18'],
      cssTarget: ['chrome125', 'safari18']
    }
  })
);
