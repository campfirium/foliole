import type { ReadingFontVariant } from './readingFontFamily';

type Names = Record<string, Record<string, Record<string, string>>>;
interface ParsedFont {
  names: Names;
  tables: {
    os2?: { usWeightClass: number; usWidthClass: number; fsSelection: number };
    fvar?: { axes: { tag: string; minValue: number; maxValue: number }[] };
  };
}

const STRETCHES = ['ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'normal',
  'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'];

function familyName(names: Names): string {
  for (const key of ['preferredFamily', 'fontFamily']) {
    for (const platform of ['windows', 'unicode', 'macintosh']) {
      const values = names[platform]?.[key];
      if (!values) continue;
      const name = values.en ?? Object.keys(values).sort().map(language => values[language]).find(Boolean);
      if (name?.trim()) return name.trim().normalize('NFC');
    }
  }
  throw new Error('Font family name is missing');
}

export async function parseReadingFont(data: ArrayBuffer) {
  const { parse } = await import('opentype.js');
  const font = parse(data) as ParsedFont;
  const name = familyName(font.names);
  const os2 = font.tables.os2;
  if (!os2) throw new Error('Font weight and style metadata is missing');
  const axes = font.tables.fvar?.axes ?? [];
  if (axes.some(axis => axis.tag === 'ital' || axis.tag === 'slnt')) {
    throw new Error('Use separate upright and italic font files');
  }
  const weight = axes.find(axis => axis.tag === 'wght');
  const weightMin = weight?.minValue ?? os2.usWeightClass;
  const weightMax = weight?.maxValue ?? os2.usWeightClass;
  const stretch = STRETCHES[os2.usWidthClass - 1];
  if (!stretch || !Number.isFinite(weightMin) || !Number.isFinite(weightMax)
    || weightMin < 1 || weightMax > 1000 || weightMin > weightMax) {
    throw new Error('Font weight or width is invalid');
  }
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const variant: ReadingFontVariant = {
    id, data, weightMin, weightMax, stretch, style: os2.fsSelection & 1 ? 'italic' : 'normal'
  };
  return { name, familyKey: name, variant };
}

export function appendFontVariant(variants: ReadingFontVariant[], variant: ReadingFontVariant) {
  if (variants.some(face => face.id === variant.id)) return;
  if (variants.some(face => face.style === variant.style && face.stretch === variant.stretch
    && face.weightMin <= variant.weightMax && variant.weightMin <= face.weightMax)) {
    throw new Error('This family already has a different font for the same weight and style');
  }
  variants.push(variant);
}
