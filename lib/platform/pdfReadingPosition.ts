export const PDF_READING_POSITION_PRECISION = 1000;

const PAGE_SPAN = PDF_READING_POSITION_PRECISION + 1;

export function encodePdfReadingPosition(page: number, positionY: number) {
  return (page - 1) * PAGE_SPAN + Math.round(positionY * PDF_READING_POSITION_PRECISION);
}

export function decodePdfReadingPosition(offset: number) {
  return { page: Math.floor(offset / PAGE_SPAN) + 1, positionY: (offset % PAGE_SPAN) / PDF_READING_POSITION_PRECISION };
}
