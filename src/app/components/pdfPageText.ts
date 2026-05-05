export interface PdfPageTextEntry {
  itemRanges: Array<{ end: number; start: number }>;
  text: string;
}

export function resolvePageText(textContent: unknown): PdfPageTextEntry {
  if (!textContent || typeof textContent !== 'object') {
    return { itemRanges: [], text: '' };
  }
  const items = Reflect.get(textContent, 'items');
  if (!Array.isArray(items)) {
    return { itemRanges: [], text: '' };
  }
  let cursor = 0;
  const itemRanges: Array<{ end: number; start: number }> = [];
  const text = items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const value = Reflect.get(item, 'str');
      const chunk = typeof value === 'string' ? value : '';
      const start = cursor;
      const end = start + chunk.length;
      itemRanges.push({ end, start });
      cursor = end;
      return chunk;
    })
    .join('');
  return { itemRanges, text };
}
