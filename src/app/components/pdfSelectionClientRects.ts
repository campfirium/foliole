// Element boxes in a native Range can include PDF.js's full-page selection helper.
// Measure the selected parts of text nodes so only text contributes coverage.
export function resolvePdfSelectionClientRects(range: Range): DOMRect[] {
  if (range.commonAncestorContainer instanceof Text) {
    return typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : [];
  }
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text) || !range.intersectsNode(node)) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (start >= end) continue;
    const fragment = document.createRange();
    fragment.setStart(node, start);
    fragment.setEnd(node, end);
    if (typeof fragment.getClientRects === 'function') rects.push(...Array.from(fragment.getClientRects()));
  }
  return rects;
}
