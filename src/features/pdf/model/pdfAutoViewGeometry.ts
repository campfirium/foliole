import { FULL_PDF_VIEW, unionPdfViews, type PdfViewRect } from './pdfReadingView';

export interface PdfRasterSample {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  pageNumbers: PdfViewRect[];
}
function inRect(x: number, y: number, rect: PdfViewRect, width: number, height: number) {
  return (
    x >= rect.x * width &&
    x <= (rect.x + rect.width) * width &&
    y >= rect.y * height &&
    y <= (rect.y + rect.height) * height
  );
}
export function inkBounds(sample: PdfRasterSample, excluded: PdfViewRect[] = []): PdfViewRect {
  let left = sample.width,
    top = sample.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < sample.height; y++) {
    for (let x = 0; x < sample.width; x++) {
      const offset = (y * sample.width + x) * 4;
      if (
        (sample.data[offset + 3] ?? 0) < 16 ||
        Math.min(
          sample.data[offset] ?? 255,
          sample.data[offset + 1] ?? 255,
          sample.data[offset + 2] ?? 255
        ) >= 245
      )
        continue;
      if (excluded.some((rect) => inRect(x, y, rect, sample.width, sample.height))) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return FULL_PDF_VIEW;
  return {
    x: Math.max(0, left - 3) / sample.width,
    y: Math.max(0, top - 3) / sample.height,
    width: (Math.min(sample.width, right + 4) - Math.max(0, left - 3)) / sample.width,
    height: (Math.min(sample.height, bottom + 4) - Math.max(0, top - 3)) / sample.height
  };
}
export function isIsolatedPageNumber(sample: PdfRasterSample, rect: PdfViewRect) {
  const body = inkBounds(sample, [rect]);
  const gap = Math.max(0.01, rect.height / 2);
  return rect.y < 0.1
    ? body.y > rect.y + rect.height + gap
    : rect.y + rect.height > 0.9 && body.y + body.height < rect.y - gap;
}
export function resolveAutomaticPdfView(samples: PdfRasterSample[]): PdfViewRect {
  return unionPdfViews(
    samples.map((sample) => {
      const excluded = sample.pageNumbers.filter((candidate) => {
        if (!isIsolatedPageNumber(sample, candidate)) return false;
        if (samples.length === 1) return true;
        return (
          samples.filter((other) =>
            other.pageNumbers.some(
              (rect) =>
                Math.abs(rect.y - candidate.y) < 0.02 &&
                Math.abs(rect.x - candidate.x) < 0.03 &&
                isIsolatedPageNumber(other, rect)
            )
          ).length >= 2
        );
      });
      return inkBounds(sample, excluded);
    })
  );
}
