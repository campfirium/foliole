export const COMPANION_PREVIEW_VIEWPORT = { width: 375, height: 812 };

/** Fits the complete preview without changing the product document's layout viewport. */
export function fitCompanionPreviewViewport(viewport: HTMLElement) {
  const target = viewport.ownerDocument.defaultView!;
  const { width, height } = COMPANION_PREVIEW_VIEWPORT;
  viewport.style.width = `${width}px`;
  viewport.style.height = `${height}px`;
  const fit = () => {
    const scale = Math.min(1, target.innerWidth / width, target.innerHeight / height);
    viewport.style.setProperty('--preview-scale', String(scale));
  };
  target.addEventListener('resize', fit);
  fit();
  return () => target.removeEventListener('resize', fit);
}
