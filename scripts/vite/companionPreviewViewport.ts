export const COMPANION_PREVIEW_VIEWPORT = { width: 375, height: 812 };
export const COMPANION_PREVIEW_STATUS_BAR_HEIGHT = 44;

/** Fits the complete preview without changing the product document's layout viewport. */
export function fitCompanionPreviewViewport(viewport: HTMLElement) {
  const target = viewport.ownerDocument.defaultView!;
  const { width, height } = COMPANION_PREVIEW_VIEWPORT;
  const frameHeight = height + COMPANION_PREVIEW_STATUS_BAR_HEIGHT;
  viewport.style.width = `${width}px`;
  viewport.style.height = `${frameHeight}px`;
  viewport.style.setProperty('--preview-content-height', `${height}px`);
  viewport.style.setProperty('--preview-status-bar-height', `${COMPANION_PREVIEW_STATUS_BAR_HEIGHT}px`);
  const fit = () => {
    const stage = viewport.closest<HTMLElement>('.sandbox-stage');
    const availableWidth = stage?.clientWidth || target.innerWidth;
    const heightLimit = stage?.clientHeight || target.innerHeight;
    const toolbar = stage?.querySelector<HTMLElement>('.sandbox-toolbar');
    const gap = 8;
    const toolbarHeight = toolbar?.offsetHeight ?? 0;
    const reservedHeight = toolbar ? toolbarHeight + gap * 3 : 0;
    const availableHeight = Math.max(1, heightLimit - reservedHeight);
    const scale = Math.min(1, availableWidth / width, availableHeight / frameHeight);
    if (toolbar) {
      const phoneHeight = frameHeight * scale;
      const phoneTop = (heightLimit - phoneHeight + toolbarHeight + gap) / 2;
      viewport.style.top = `${phoneTop + phoneHeight / 2}px`;
      toolbar.style.top = `${phoneTop - toolbarHeight - gap}px`;
      toolbar.style.width = `${width * scale}px`;
    }
    viewport.style.setProperty('--preview-scale', String(scale));
  };
  target.addEventListener('resize', fit);
  fit();
  return () => target.removeEventListener('resize', fit);
}
