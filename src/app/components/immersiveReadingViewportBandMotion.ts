import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

export const IMMERSIVE_READING_SCROLL_DURATION_MS = 468;

const activeScrollFrames = new WeakMap<EditorAdapter, number>();

function easeInOutCosine(progress: number) {
  return 0.5 * (1 - Math.cos(Math.PI * progress));
}

export function startImmersiveReadingScrollMotion(editor: EditorAdapter, targetScrollTop: number) {
  const activeFrame = activeScrollFrames.get(editor);
  if (activeFrame !== undefined) {
    cancelAnimationFrame(activeFrame);
  }
  const startScrollTop = editor.getScrollTop();
  const distance = targetScrollTop - startScrollTop;
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduceMotion || Math.abs(distance) < 1) {
    editor.setScrollTop(targetScrollTop);
    activeScrollFrames.delete(editor);
    return;
  }
  let startedAt: number | null = null;
  let expectedScrollTop = startScrollTop;
  const animate = (timestamp: number) => {
    if (startedAt === null) startedAt = timestamp;
    if (Math.abs(editor.getScrollTop() - expectedScrollTop) > 2) {
      activeScrollFrames.delete(editor);
      return;
    }
    const progress = Math.min(1, (timestamp - startedAt) / IMMERSIVE_READING_SCROLL_DURATION_MS);
    expectedScrollTop = startScrollTop + distance * easeInOutCosine(progress);
    editor.setScrollTop(expectedScrollTop);
    if (progress < 1) {
      activeScrollFrames.set(editor, requestAnimationFrame(animate));
      return;
    }
    activeScrollFrames.delete(editor);
  };
  activeScrollFrames.set(editor, requestAnimationFrame(animate));
}
