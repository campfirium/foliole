import * as React from 'react';

import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from './Tooltip';

type TruncatedTextTooltipProps = {
  children: React.ReactNode;
  text: string;
} & React.ComponentPropsWithoutRef<'span'>;

const DEFAULT_SIDE_OFFSET = 6;
const TOOLTIP_ARROW_WIDTH = 8;
const TOOLTIP_BOUNDARY_GAP = 2;
const TOOLTIP_BOUNDARY_SELECTORS = [
  '.workspace-region-main-topic',
  '.workspace-region-main-folder',
  '[aria-label="Folder list body"]',
  '[aria-label="Current folder contents"]',
  '[role="tree"]',
];

function isElementTruncated(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

function getTooltipBoundary(element: HTMLElement) {
  for (const selector of TOOLTIP_BOUNDARY_SELECTORS) {
    const boundary = element.closest<HTMLElement>(selector);
    if (boundary) {
      return boundary;
    }
  }
  return null;
}

function getTooltipSideOffset(element: HTMLElement) {
  const boundary = getTooltipBoundary(element);
  if (!boundary) {
    return DEFAULT_SIDE_OFFSET;
  }

  const triggerRect = element.getBoundingClientRect();
  const boundaryRect = boundary.getBoundingClientRect();
  const offset = boundaryRect.right - triggerRect.right + TOOLTIP_ARROW_WIDTH + TOOLTIP_BOUNDARY_GAP;
  return Math.max(DEFAULT_SIDE_OFFSET, Math.round(offset));
}

export function TruncatedTextTooltip({ children, text, ...spanProps }: TruncatedTextTooltipProps) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const [sideOffset, setSideOffset] = React.useState(DEFAULT_SIDE_OFFSET);

  const updateTooltipState = React.useCallback(() => {
    const element = textRef.current;
    setIsTruncated(element ? isElementTruncated(element) : false);
    setSideOffset(element ? getTooltipSideOffset(element) : DEFAULT_SIDE_OFFSET);
  }, []);

  React.useLayoutEffect(() => {
    updateTooltipState();
    const element = textRef.current;
    if (!element) {
      return;
    }

    window.addEventListener('resize', updateTooltipState);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', updateTooltipState);
    }

    const observer = new ResizeObserver(updateTooltipState);
    observer.observe(element);
    const boundary = getTooltipBoundary(element);
    if (boundary) {
      observer.observe(boundary);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTooltipState);
    };
  }, [text, updateTooltipState]);

  const textElement = (
    <span
      {...spanProps}
      data-truncated-text-tooltip-trigger={isTruncated ? 'true' : 'false'}
      data-truncated-text-tooltip-side-offset={isTruncated ? sideOffset : undefined}
      onFocus={updateTooltipState}
      onPointerEnter={updateTooltipState}
      ref={textRef}
    >
      {children}
    </span>
  );

  if (!isTruncated) {
    return textElement;
  }

  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>{textElement}</AppTooltipTrigger>
      <AppTooltipContent
        align="center"
        className="relative max-w-[min(16rem,calc(100vw-2rem))] text-foreground/86 [--app-tooltip-bg:color-mix(in_srgb,rgb(var(--color-bg-elevated))_88%,rgb(var(--color-bg-panel))_12%)] [--app-tooltip-border-color:rgb(var(--color-foreground)/0.12)] [--app-tooltip-fg:rgb(var(--color-foreground)/0.86)] [--app-tooltip-shadow:var(--shadow-panel)] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-y-[8px] before:border-r-[8px] before:border-y-transparent before:border-r-[var(--app-tooltip-border-color)] before:content-[''] after:absolute after:right-[calc(100%-1px)] after:top-1/2 after:-translate-y-1/2 after:border-y-[7px] after:border-r-[7px] after:border-y-transparent after:border-r-[var(--app-tooltip-bg)] after:content-['']"
        side="right"
        sideOffset={sideOffset}
      >
        {text}
      </AppTooltipContent>
    </AppTooltip>
  );
}
