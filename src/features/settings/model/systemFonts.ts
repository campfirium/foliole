import { invoke } from '@tauri-apps/api/core';

const BASE_FONTS = ['monospace', 'sans-serif', 'serif'] as const;
const FONT_CANDIDATES = [
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei UI',
  'Microsoft YaHei',
  'Noto Sans CJK SC',
  'Noto Sans SC',
  'Segoe UI',
  'Segoe UI Variable',
  'Arial',
  'Helvetica Neue',
  'Roboto',
  'Inter',
  'Source Sans 3',
  'Source Serif 4',
  'SF Pro Text',
  'SF Pro Display',
  'SF Pro Rounded',
  'SimSun',
  'Songti SC',
  'KaiTi'
] as const;

const TEST_TEXT = 'AaBbCcDdEe1234567890的一是在不了有和人这中大';
interface TauriCoreBridge {
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriBridgeWindow extends Window {
  __TAURI__?: {
    core?: TauriCoreBridge;
  };
  __TAURI_INTERNALS__?: unknown;
}

export interface SystemFontCatalog {
  fonts: string[];
  monospaceFonts: string[];
}

function isTauriRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }
  const tauriWindow = window as TauriBridgeWindow;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

function measureWidth(fontFamily: string, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  context.font = `16px ${fontFamily}`;
  return context.measureText(TEST_TEXT).width;
}

export function detectSystemFonts(): string[] {
  if (typeof document === 'undefined') {
    return [];
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return [];
  }

  const baselineWidthByFamily = new Map<string, number>();
  for (const baseFont of BASE_FONTS) {
    baselineWidthByFamily.set(baseFont, measureWidth(baseFont, canvas, context));
  }

  return FONT_CANDIDATES.filter((candidate) =>
    BASE_FONTS.some((baseFont) => {
      const baselineWidth = baselineWidthByFamily.get(baseFont);
      if (baselineWidth === undefined) {
        return false;
      }
      const width = measureWidth(`'${candidate}', ${baseFont}`, canvas, context);
      return Math.abs(width - baselineWidth) > 0.1;
    })
  );
}

function normalizeFontList(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) => left.localeCompare(right));
}

function detectMonospaceFonts(fonts: string[]) {
  const monoHint = /mono|code|console|consolas|courier|menlo|fira|cascadia/i;
  return fonts.filter((font) => monoHint.test(font));
}

export async function listAvailableSystemFonts(): Promise<SystemFontCatalog> {
  if (typeof window === 'undefined') {
    return { fonts: [], monospaceFonts: [] };
  }
  if (!isTauriRuntime()) {
    const fallbackFonts = detectSystemFonts();
    return {
      fonts: fallbackFonts,
      monospaceFonts: detectMonospaceFonts(fallbackFonts)
    };
  }

  try {
    const result = await invoke('list_system_fonts');
    if (!result || typeof result !== 'object') {
      const fallbackFonts = detectSystemFonts();
      return { fonts: fallbackFonts, monospaceFonts: detectMonospaceFonts(fallbackFonts) };
    }
    const rawFonts = (result as { fonts?: unknown }).fonts;
    const rawMonospaceFonts = (result as { monospace_fonts?: unknown }).monospace_fonts;
    const fonts = Array.isArray(rawFonts) ? rawFonts.filter((value): value is string => typeof value === 'string') : [];
    const monospaceFonts = Array.isArray(rawMonospaceFonts)
      ? rawMonospaceFonts.filter((value): value is string => typeof value === 'string')
      : [];
    const normalizedFonts = normalizeFontList(fonts);
    const normalizedMonospaceFonts = normalizeFontList(monospaceFonts);
    if (normalizedFonts.length === 0) {
      const fallbackFonts = detectSystemFonts();
      return {
        fonts: fallbackFonts,
        monospaceFonts: detectMonospaceFonts(fallbackFonts)
      };
    }
    return {
      fonts: normalizedFonts,
      monospaceFonts: normalizedMonospaceFonts.length > 0 ? normalizedMonospaceFonts : detectMonospaceFonts(normalizedFonts)
    };
  } catch {
    const fallbackFonts = detectSystemFonts();
    return {
      fonts: fallbackFonts,
      monospaceFonts: detectMonospaceFonts(fallbackFonts)
    };
  }
}
