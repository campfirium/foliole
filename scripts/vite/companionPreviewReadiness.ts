/** Observes completion of the product's restore; never restores or writes navigation itself. */
export function observeCompanionPreviewReadiness(target: Window, ready: () => void) {
  const document = target.document;
  let firstFrame = 0;
  let secondFrame = 0;
  const schedule = () => {
    target.cancelAnimationFrame(firstFrame);
    target.cancelAnimationFrame(secondFrame);
    firstFrame = target.requestAnimationFrame(() => {
      secondFrame = target.requestAnimationFrame(() => {
        if (document.querySelector('[data-companion-preview-ready="true"]')) ready();
      });
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  document.addEventListener('scroll', schedule, true);
  schedule();
  return () => {
    observer.disconnect();
    document.removeEventListener('scroll', schedule, true);
    target.cancelAnimationFrame(firstFrame);
    target.cancelAnimationFrame(secondFrame);
  };
}

export function capturePreviewRestoreTarget(document: Document) {
  const destination = document.querySelector('[data-companion-preview-destination]')?.getAttribute('data-companion-preview-destination');
  const article = document.querySelector('[data-companion-article-document="true"]');
  const nodeId = article?.getAttribute('data-node-id') ?? null;
  const readingTop = readingScroller(document)?.scrollTop;
  const hadPdfCanvas = document.querySelector('.pdf-document-surface canvas') !== null;
  const positions = ['[data-testid="companion-scroll-container"]', '.cm-scroller'].flatMap(selector => {
    const element = document.querySelector(selector);
    return element ? [{ selector, top: element.scrollTop }] : [];
  });
  return (candidate: Document) => {
    if (destination && candidate.querySelector('[data-companion-preview-destination]')?.getAttribute('data-companion-preview-destination') !== destination)
      return false;
    if (nodeId && candidate.querySelector('[data-companion-article-document="true"]')?.getAttribute('data-node-id') !== nodeId)
      return false;
    const scroller = readingScroller(candidate);
    if (readingTop !== undefined && (!scroller || Math.abs(scroller.scrollTop - readingTop) > 2))
      return false;
    const canvas = candidate.querySelector('.pdf-document-surface canvas');
    if (hadPdfCanvas && (!canvas || candidate.defaultView!.getComputedStyle(canvas).visibility === 'hidden')) return false;
    return positions.every(({ selector, top }) => {
      const element = candidate.querySelector(selector);
      return element !== null && Math.abs(element.scrollTop - top) <= 2;
    });
  };
}

function readingScroller(document: Document) {
  let element = document.querySelector('[data-companion-article-document="true"], [data-pdf-page]')?.parentElement;
  while (element) {
    if (/auto|scroll/u.test(document.defaultView!.getComputedStyle(element).overflowY)) return element;
    element = element.parentElement;
  }
  return null;
}
