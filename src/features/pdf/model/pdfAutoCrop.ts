export interface PdfCropBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const CROP_VERTICAL_PADDING_PX = 56;
const CROP_HORIZONTAL_PADDING_PX = 72;
const MAX_HORIZONTAL_TRIM_PX = 24;
const MIN_HORIZONTAL_RETAINED_RATIO = 0.92;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toPaddedCropBox(args: {
  bottom: number;
  left: number;
  pageHeight: number;
  pageWidth: number;
  right: number;
  top: number;
}): PdfCropBox | null {
  const left = clamp(Math.floor(args.left - CROP_HORIZONTAL_PADDING_PX), 0, args.pageWidth);
  const top = clamp(Math.floor(args.top - CROP_VERTICAL_PADDING_PX), 0, args.pageHeight);
  const right = clamp(Math.ceil(args.right + CROP_HORIZONTAL_PADDING_PX), 0, args.pageWidth);
  const bottom = clamp(Math.ceil(args.bottom + CROP_VERTICAL_PADDING_PX), 0, args.pageHeight);
  const cropBox = right > left && bottom > top ? { bottom, left, right, top } : null;
  return cropBox ? capHorizontalTrim(retainSafeHorizontalArea(cropBox, args.pageWidth), args.pageWidth) : null;
}

function retainSafeHorizontalArea(cropBox: PdfCropBox, pageWidth: number): PdfCropBox {
  const minWidth = pageWidth * MIN_HORIZONTAL_RETAINED_RATIO;
  const cropWidth = cropBox.right - cropBox.left;
  if (cropWidth >= minWidth) {
    return cropBox;
  }
  const center = (cropBox.left + cropBox.right) / 2;
  const left = clamp(Math.floor(center - minWidth / 2), 0, Math.max(0, pageWidth - minWidth));
  const right = clamp(Math.ceil(left + minWidth), 0, pageWidth);
  return { ...cropBox, left, right };
}

function capHorizontalTrim(cropBox: PdfCropBox, pageWidth: number): PdfCropBox {
  return {
    ...cropBox,
    left: Math.min(cropBox.left, MAX_HORIZONTAL_TRIM_PX),
    right: Math.max(cropBox.right, pageWidth - MAX_HORIZONTAL_TRIM_PX)
  };
}

export function measurePdfTextLayerCropBox(pageElement: HTMLElement | null): PdfCropBox | null {
  if (!pageElement) {
    return null;
  }
  const pageRect = pageElement.getBoundingClientRect();
  const textElements = Array.from(pageElement.querySelectorAll<HTMLElement>('.textLayer span'));
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const element of textElements) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !element.textContent?.trim()) {
      continue;
    }
    left = Math.min(left, rect.left - pageRect.left);
    top = Math.min(top, rect.top - pageRect.top);
    right = Math.max(right, rect.right - pageRect.left);
    bottom = Math.max(bottom, rect.bottom - pageRect.top);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }
  return toPaddedCropBox({
    bottom,
    left,
    pageHeight: pageRect.height,
    pageWidth: pageRect.width,
    right,
    top
  });
}

export function resolvePdfCropScale(_pageWidth: number, cropBox: PdfCropBox | null) {
  if (!cropBox) {
    return 1;
  }
  const cropWidth = cropBox.right - cropBox.left;
  if (cropWidth <= 0) {
    return 1;
  }
  return 1;
}
