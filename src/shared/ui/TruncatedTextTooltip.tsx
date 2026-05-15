import * as React from 'react';

import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from './Tooltip';

type TruncatedTextTooltipProps = {
  children: React.ReactNode;
  text: string;
} & React.ComponentPropsWithoutRef<'span'>;

function isElementTruncated(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

export function TruncatedTextTooltip({ children, text, ...spanProps }: TruncatedTextTooltipProps) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  const updateTruncatedState = React.useCallback(() => {
    const element = textRef.current;
    setIsTruncated(element ? isElementTruncated(element) : false);
  }, []);

  React.useLayoutEffect(() => {
    updateTruncatedState();
    const element = textRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateTruncatedState);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, updateTruncatedState]);

  const textElement = (
    <span
      {...spanProps}
      data-truncated-text-tooltip-trigger={isTruncated ? 'true' : 'false'}
      onFocus={updateTruncatedState}
      onPointerEnter={updateTruncatedState}
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
      <AppTooltipContent align="start" side="top">{text}</AppTooltipContent>
    </AppTooltip>
  );
}
