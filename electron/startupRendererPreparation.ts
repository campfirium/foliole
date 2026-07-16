import fs from 'node:fs';

import { nativeTheme } from 'electron';

import { resolveRuntimeRendererIndexPath, writePrebuiltRendererHtmlForSettings } from './runtimeRendererHtml.js';

export interface StartupRendererAppearance {
  backgroundColor: string;
  displayScalePercent?: number;
}

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

function extractHtmlTag(html: string) {
  return html.match(/<html\b[^>]*>/iu)?.[0] ?? '';
}

function extractLastStartupDocumentBackground(html: string) {
  const tag = extractHtmlTag(html);
  const matches = [...tag.matchAll(/--startup-region-main-document-bg:\s*(#[0-9a-f]{6})\s*;/giu)];
  return matches.at(-1)?.[1] ?? null;
}

function extractLastStartupDisplayScalePercent(html: string) {
  const tag = extractHtmlTag(html);
  const matches = [...tag.matchAll(/--startup-app-display-scale-percent:\s*(\d+)\s*;/giu)];
  const percent = Number(matches.at(-1)?.[1]);
  return Number.isInteger(percent) && percent >= 80 && percent <= 200 && percent % 10 === 0 ? percent : null;
}

export function writeStartupRendererHtml(runtimeDir: string, settings: Record<string, unknown>, runtimeHtmlDir: string) {
  const systemColorMode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return writePrebuiltRendererHtmlForSettings(runtimeDir, settings, resolveRendererUrl(), runtimeHtmlDir, systemColorMode);
}

export function prepareStartupRendererAppearance(
  _runtimeDir: string,
  runtimeHtmlDir: string
): StartupRendererAppearance | null {
  let html = '';
  try {
    html = fs.readFileSync(resolveRuntimeRendererIndexPath(runtimeHtmlDir), 'utf8');
  } catch {
    // The fallback values below keep first-run startup deterministic.
  }
  return {
    backgroundColor: extractLastStartupDocumentBackground(html) ?? (nativeTheme.shouldUseDarkColors ? '#161918' : '#ffffff'),
    displayScalePercent: extractLastStartupDisplayScalePercent(html) ?? 100
  };
}
