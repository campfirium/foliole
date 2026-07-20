const INVISIBLE_PDF_TEXT_PATTERN = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;

function removeUnsupportedControls(value: string) {
  return Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);
    return code !== 0x7f && (code > 0x1f || code === 0x09 || code === 0x0a);
  }).join('');
}

export function normalizePdfRangeText(value: string | null | undefined) {
  return removeUnsupportedControls((value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_PDF_TEXT_PATTERN, ''))
    .trim();
}

export function resolvePdfRangeText(range: Range) {
  return normalizePdfRangeText(range.cloneContents().textContent);
}
