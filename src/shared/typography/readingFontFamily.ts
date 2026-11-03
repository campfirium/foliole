export interface ReadingFontFace {
  id: string;
  style: 'normal' | 'italic';
  weightMin: number;
  weightMax: number;
  stretch: string;
}

export interface ReadingFontVariant extends ReadingFontFace {
  data: ArrayBuffer;
}

export interface ReadingFontRecord {
  id: string;
  name: string;
  data: ArrayBuffer;
  familyKey?: string;
  face?: ReadingFontFace;
  variants?: ReadingFontVariant[];
  version?: string;
}

export interface ReadingFontFamily {
  id: string;
  name: string;
  faces: ReadingFontFace[];
}

export function fontVariants(record: ReadingFontRecord): ReadingFontVariant[] {
  return [{ ...(record.face ?? { id: 'legacy', style: 'normal', weightMin: 400, weightMax: 400, stretch: 'normal' }),
    data: record.data }, ...(record.variants ?? [])];
}

export function fontFamily(record: ReadingFontRecord): ReadingFontFamily {
  return { id: record.id, name: record.name, faces: fontVariants(record).map(({ id, style, weightMin, weightMax, stretch }) =>
    ({ id, style, weightMin, weightMax, stretch })) };
}

export function readingFontCssFamily(id: string) {
  return `FolioleReadingFont_${id.replace(/-/g, '_')}`;
}

export function fontFaceLabel(face: ReadingFontFace) {
  const weight = face.weightMin === face.weightMax ? String(face.weightMin) : `${face.weightMin}–${face.weightMax}`;
  return `${weight}${face.style === 'italic' ? ' Italic' : ''}${face.stretch === 'normal' ? '' : ` ${face.stretch}`}`;
}
