import { useEffect, useLayoutEffect, useState, type MutableRefObject } from 'react';

interface UseFitBlockImageHeightArgs {
  fitBlockImagesToViewport: boolean;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  hasMarkdownImages: boolean;
  nodeId: string | null;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number; viewportHeight: number } | null) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  value: string;
}

function measureNonImageHeight(content: HTMLElement) {
  const contentStyle = getComputedStyle(content);
  const paddingTop = Number.parseFloat(contentStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(contentStyle.paddingBottom) || 0;
  const directChildren = Array.from(content.children) as HTMLElement[];

  return directChildren.reduce((sum, child) => {
    const imageElement = child.querySelector('.cm-md-image-element-block') as HTMLElement | null;
    if (imageElement) {
      return sum + Math.max(0, child.getBoundingClientRect().height - imageElement.getBoundingClientRect().height);
    }
    return sum + child.getBoundingClientRect().height;
  }, paddingTop + paddingBottom);
}

function useImageHeightReporter(args: UseFitBlockImageHeightArgs) {
  const { fitBlockImagesToViewport, hasMarkdownImages, hostRef, nodeId, onFitBlockImageMetricsChange, rootRef, value } = args;
  const [imageMaxHeight, setImageMaxHeight] = useState<string | undefined>(undefined);
  const imageEffectSource = hasMarkdownImages ? value : '';

  useLayoutEffect(() => {
    if (!fitBlockImagesToViewport || !hasMarkdownImages || !rootRef.current) {
      setImageMaxHeight(undefined);
      onFitBlockImageMetricsChange?.(null);
      return;
    }

    const element = rootRef.current;
    const host = hostRef.current;
    let frameId = 0;
    const updateHeight = () => {
      const content = element.querySelector('.cm-content') as HTMLElement | null;
      const scroller = element.querySelector('.cm-scroller') as HTMLElement | null;
      const imageElements = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLElement[];
      if (!content || !scroller || imageElements.length === 0) {
        setImageMaxHeight(undefined);
        onFitBlockImageMetricsChange?.(null);
        return;
      }
      const nonImageHeight = measureNonImageHeight(content);
      const nextHeight = Math.max(120, Math.floor((scroller.clientHeight - nonImageHeight - 8) / imageElements.length));
      onFitBlockImageMetricsChange?.({ imageCount: imageElements.length, nonImageHeight, viewportHeight: scroller.clientHeight });
      setImageMaxHeight((current) => {
        const nextValue = `${nextHeight}px`;
        return current === nextValue ? current : nextValue;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateHeight);
    };
    const handleImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.classList.contains('cm-md-image-element-block')) {
        schedule();
      }
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(element);
    if (host) {
      resizeObserver?.observe(host);
    }
    element.addEventListener('load', handleImageLoad, true);
    schedule();

    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener('load', handleImageLoad, true);
      resizeObserver?.disconnect();
    };
  }, [fitBlockImagesToViewport, hasMarkdownImages, hostRef, imageEffectSource, nodeId, onFitBlockImageMetricsChange, rootRef]);

  return imageMaxHeight;
}

interface UseImageLoadStateArgs {
  hasMarkdownImages: boolean;
  nodeId: string | null;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  value: string;
}

function useImageLoadStateReporter(args: UseImageLoadStateArgs) {
  const { hasMarkdownImages, nodeId, onImageLoadStateChange, rootRef, value } = args;
  const imageEffectSource = hasMarkdownImages ? value : '';

  useEffect(() => {
    if (!hasMarkdownImages || !rootRef.current) {
      onImageLoadStateChange?.({ loadedCount: 0, totalCount: 0 });
      return;
    }

    const element = rootRef.current;
    let frameId = 0;
    const reportState = () => {
      const images = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLImageElement[];
      onImageLoadStateChange?.({
        loadedCount: images.filter((image) => image.complete).length,
        totalCount: images.length
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(reportState);
    };
    const handleImageEvent = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.classList.contains('cm-md-image-element-block')) {
        schedule();
      }
    };

    schedule();
    element.addEventListener('error', handleImageEvent, true);
    element.addEventListener('load', handleImageEvent, true);

    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener('error', handleImageEvent, true);
      element.removeEventListener('load', handleImageEvent, true);
    };
  }, [hasMarkdownImages, imageEffectSource, nodeId, onImageLoadStateChange, rootRef]);
}

export function useMarkdownEditorImageEffects(args: UseFitBlockImageHeightArgs & UseImageLoadStateArgs) {
  const imageMaxHeight = useImageHeightReporter(args);
  useImageLoadStateReporter(args);
  return { imageMaxHeight };
}
