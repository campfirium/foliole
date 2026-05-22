import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveRendererIndexPath } from './runtimePaths.js';
import { createStartupSkeletonAppearance, createStartupSkeletonLayoutFromSettings } from './startupSkeletonLayout.js';

const RUNTIME_RENDERER_INDEX_FILENAME = 'runtime-renderer-index.html';

export function resolveRendererFilePath(runtimeDir: string) {
  return resolveRendererIndexPath(runtimeDir, fs.existsSync);
}

export function resolveSourceRendererIndexPath(runtimeDir: string) {
  return path.join(runtimeDir, '..', '..', 'index.html');
}

export function resolveRuntimeRendererIndexPath(runtimeHtmlDir: string) {
  return path.join(runtimeHtmlDir, RUNTIME_RENDERER_INDEX_FILENAME);
}

function createRendererHtmlBaseTag(indexPath: string) {
  const href = pathToFileURL(`${path.dirname(indexPath)}${path.sep}`).href;
  return `<base href="${href}">`;
}

function createDevRendererHtmlBaseTag(devUrl: string) {
  const href = new URL(devUrl);
  href.pathname = href.pathname.endsWith('/') ? href.pathname : `${href.pathname}/`;
  href.search = '';
  href.hash = '';
  return `<base href="${href.toString()}">`;
}

function normalizeDevUrl(devUrl: string | null) {
  return devUrl ? new URL(devUrl).toString() : null;
}

function removeStartupBootScript(html: string) {
  return html.replace(/\s*<script>\s*\/\*STARTUP_INJECTED_BOOT_SCRIPT\*\/\s*<\/script>/, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createDevRendererEntryLoader(entryUrl: string) {
  const encodedEntryUrl = JSON.stringify(entryUrl);
  return `<script>
      (() => {
        const entry = document.createElement('script');
        entry.type = 'module';
        entry.src = ${encodedEntryUrl};
        document.body.appendChild(entry);
      })();
    </script>`;
}

function replaceDevRendererEntryWithAsyncLoader(html: string, entryUrl: string) {
  const escapedEntryUrl = escapeRegExp(entryUrl);
  return html.replace(
    new RegExp(`<script\\b([^>]*\\btype=["']module["'][^>]*\\bsrc=["']${escapedEntryUrl}["'][^>]*)><\\/script>`, 'u'),
    createDevRendererEntryLoader(entryUrl)
  );
}

function injectStartupDocumentState(html: string, themeSource: 'dark' | 'light') {
  return html.replace(
    /<html\b([^>]*)>/,
    `<html$1 data-base-color="${themeSource}" data-resolved-base-color="${themeSource}">`
  );
}

export function injectStartupTokensIntoRendererHtml(
  html: string,
  indexPath: string,
  startupCss: string,
  themeSource: 'dark' | 'light'
) {
  const withDocumentState = injectStartupTokensIntoHtml(html, startupCss, themeSource);
  if (withDocumentState.includes('<base href=')) {
    return withDocumentState;
  }
  return withDocumentState.replace('<head>', `<head>\n    ${createRendererHtmlBaseTag(indexPath)}`);
}

function injectStartupTokensIntoHtml(html: string, startupCss: string, themeSource: 'dark' | 'light') {
  const withStartupCss = html.replace('/*STARTUP_INJECTED_CSS*/', startupCss);
  return injectStartupDocumentState(removeStartupBootScript(withStartupCss), themeSource);
}

export function injectDevRendererIntoHtml(
  html: string,
  devUrl: string,
  startupCss: string,
  themeSource: 'dark' | 'light'
) {
  const normalizedDevUrl = normalizeDevUrl(devUrl) ?? devUrl;
  const devOrigin = new URL(normalizedDevUrl).origin;
  const entryUrl = `${devOrigin}/src/main.tsx`;
  const withStartupState = replaceDevRendererEntryWithAsyncLoader(
    injectStartupTokensIntoHtml(html, startupCss, themeSource).replace(
      'src="/src/main.tsx"',
      `src="${entryUrl}"`
    ),
    entryUrl
  );
  if (withStartupState.includes('<base href=')) {
    return withStartupState;
  }
  return withStartupState
    .replace('<head>', `<head>\n    ${createDevRendererHtmlBaseTag(normalizedDevUrl)}`);
}

function writeRuntimeRendererHtml(runtimeIndexPath: string, html: string) {
  fs.writeFileSync(runtimeIndexPath, html, 'utf8');
}

export function writePrebuiltRendererHtmlForSettings(
  runtimeDir: string,
  settings: Record<string, unknown>,
  devUrl: string | null,
  runtimeHtmlDir: string
) {
  const normalizedDevUrl = normalizeDevUrl(devUrl);
  const indexPath = normalizedDevUrl ? resolveSourceRendererIndexPath(runtimeDir) : resolveRendererFilePath(runtimeDir);
  if (!fs.existsSync(indexPath)) {
    return false;
  }
  const appearance = createStartupSkeletonAppearance(createStartupSkeletonLayoutFromSettings(settings), settings);
  const sourceHtml = fs.readFileSync(indexPath, 'utf8');
  const runtimeHtml = normalizedDevUrl
    ? injectDevRendererIntoHtml(sourceHtml, normalizedDevUrl, appearance.css, appearance.themeSource)
    : injectStartupTokensIntoRendererHtml(sourceHtml, indexPath, appearance.css, appearance.themeSource);
  fs.mkdirSync(runtimeHtmlDir, { recursive: true });
  writeRuntimeRendererHtml(resolveRuntimeRendererIndexPath(runtimeHtmlDir), runtimeHtml);
  return true;
}
