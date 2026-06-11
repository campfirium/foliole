import { writePrebuiltRendererHtmlForSettings } from './runtimeRendererHtml.js';

export interface StartupRendererAppearance {
  backgroundColor: string;
}

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

export function writeStartupRendererHtml(runtimeDir: string, settings: Record<string, unknown>, runtimeHtmlDir: string) {
  return writePrebuiltRendererHtmlForSettings(runtimeDir, settings, resolveRendererUrl(), runtimeHtmlDir);
}

export function prepareStartupRendererAppearance(
  _runtimeDir: string,
  _runtimeHtmlDir: string
): StartupRendererAppearance | null {
  return null;
}
