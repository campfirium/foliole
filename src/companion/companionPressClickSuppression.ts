const pendingClicks = new WeakMap<Document, () => void>();

/** An early press action may replace its target before the browser dispatches its click. */
export function suppressCompanionPressClick(ownerDocument: Document) {
  pendingClicks.get(ownerDocument)?.();

  function clear() {
    ownerDocument.removeEventListener('click', consume, true);
    ownerDocument.removeEventListener('pointerdown', clear, true);
    ownerDocument.removeEventListener('keydown', clear, true);
    pendingClicks.delete(ownerDocument);
  }

  function consume(event: MouseEvent) {
    if (event.detail === 0) return;
    clear();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  pendingClicks.set(ownerDocument, clear);
  ownerDocument.addEventListener('click', consume, true);
  ownerDocument.addEventListener('pointerdown', clear, true);
  ownerDocument.addEventListener('keydown', clear, true);
}
