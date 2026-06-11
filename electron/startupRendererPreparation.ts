import fs from 'node:fs';

import { nativeTheme } from 'electron';

import { resolveRuntimeRendererIndexPath, writePrebuiltRendererHtmlForSettings } from './runtimeRendererHtml.js';

export interface StartupRendererAppearance {
  backgroundColor: string;
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

function readStartupDocumentBackground(runtimeHtmlDir: string) {
  try {
    return extractLastStartupDocumentBackground(fs.readFileSync(resolveRuntimeRendererIndexPath(runtimeHtmlDir), 'utf8'));
  } catch {
    return null;
  }
}

export function writeStartupRendererHtml(runtimeDir: string, settings: Record<string, unknown>, runtimeHtmlDir: string) {
  const systemColorMode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return writePrebuiltRendererHtmlForSettings(runtimeDir, settings, resolveRendererUrl(), runtimeHtmlDir, systemColorMode);
}

export function prepareStartupRendererAppearance(
  _runtimeDir: string,
  runtimeHtmlDir: string
): StartupRendererAppearance | null {
  return {
    backgroundColor: readStartupDocumentBackground(runtimeHtmlDir) ?? (nativeTheme.shouldUseDarkColors ? '#1f211f' : '#ffffff')
  };
}
