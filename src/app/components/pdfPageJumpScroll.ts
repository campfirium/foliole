export function isReadyPageElement(element: HTMLDivElement | null) {
  return element?.dataset.pdfPageState === 'ready';
}

export function resolvePageJumpTop(container: HTMLDivElement, target: HTMLDivElement, positionY: number | null) {
  return positionY === null
    ? Math.max(0, target.offsetTop - 8)
    : Math.max(0, target.offsetTop + target.clientHeight * positionY - container.clientHeight * 0.35);
}

export function scrollContainerToTop(container: HTMLDivElement, top: number, behavior: ScrollBehavior) {
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ behavior, top });
  } else {
    container.scrollTop = top;
  }
}
