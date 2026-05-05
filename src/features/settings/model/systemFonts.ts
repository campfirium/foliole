import { listRuntimeSystemFonts } from '../../../shared/platform/bridge';

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

export interface SystemFontCatalog {
  fonts: string[];
  monospaceFonts: string[];
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
  const expanded = [...new Set(values.flatMap((value) => expandWindowsRegistryLikeFontName(value)).filter((value) => value.length > 0))].sort(
    (left, right) => left.localeCompare(right)
  );
  return collapseStyleVariantFamilies(expanded);
}

function detectMonospaceFonts(fonts: string[]) {
  const monoHint = /mono|code|console|consolas|courier|menlo|fira|cascadia/i;
  return fonts.filter((font) => monoHint.test(font));
}

function expandWindowsRegistryLikeFontName(rawName: string) {
  const cleaned = rawName.replace(/^@/, '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (!cleaned) {
    return [];
  }
  return cleaned
    .split(/\s+&\s+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

const FONT_STYLE_TOKEN = /(thin|extra[\s-]?light|ultra[\s-]?light|light|book|regular|normal|medium|semi[\s-]?bold|demi[\s-]?bold|bold|extra[\s-]?bold|ultra[\s-]?bold|black|heavy|italic|oblique)$/i;

function trimStyleSuffix(value: string) {
  let current = value.trim();
  while (current.length > 0) {
    const next = current.replace(/[\s-]+(thin|extra[\s-]?light|ultra[\s-]?light|light|book|regular|normal|medium|semi[\s-]?bold|demi[\s-]?bold|bold|extra[\s-]?bold|ultra[\s-]?bold|black|heavy|italic|oblique)$/i, '').trim();
    if (next === current) {
      return current;
    }
    current = next;
  }
  return value.trim();
}

function collapseStyleVariantFamilies(fonts: string[]) {
  const familySet = new Set(fonts);
  return fonts.filter((font) => {
    if (!FONT_STYLE_TOKEN.test(font)) {
      return true;
    }
    const stem = trimStyleSuffix(font);
    return stem.length === 0 || !familySet.has(stem);
  });
}

export async function listAvailableSystemFonts(): Promise<SystemFontCatalog> {
  if (typeof window === 'undefined') {
    return { fonts: [], monospaceFonts: [] };
  }

  try {
    const result = await listRuntimeSystemFonts();
    if (!result) {
      const fallbackFonts = detectSystemFonts();
      return { fonts: fallbackFonts, monospaceFonts: detectMonospaceFonts(fallbackFonts) };
    }
    const normalizedFonts = normalizeFontList(result.fonts);
    const normalizedMonospaceFonts = normalizeFontList(result.monospaceFonts);
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
