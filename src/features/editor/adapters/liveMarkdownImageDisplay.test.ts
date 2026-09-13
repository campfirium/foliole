import { expect, it, vi } from 'vitest';

import { finalizeMarkdownImageDisplay } from './liveMarkdownImageDisplay';
import { createMarkdownImageWidgetDom } from './liveMarkdownImages';

function createMatch(display: 'block' | 'inline', displayWidth?: number) {
  return {
    alt: 'Remote',
    attachmentId: null,
    display,
    ...(displayWidth ? { displayWidth } : {}),
    from: 0,
    source: 'https://example.com/image.png',
    to: 40
  };
}

it('changes a provisional inline widget to the final block layout once', () => {
  const requestMeasure = vi.fn();
  const widget = createMarkdownImageWidgetDom(createMatch('inline'), null, null, requestMeasure);

  finalizeMarkdownImageDisplay(widget, createMatch('inline'), { height: 900, width: 1200 }, requestMeasure);
  finalizeMarkdownImageDisplay(widget, createMatch('inline'), { height: 64, width: 64 }, requestMeasure);

  expect(widget).toHaveClass('cm-md-image-widget-block');
  expect(widget).toHaveAttribute('data-md-image-final-display', 'block');
  expect(widget.querySelector('.cm-md-image-surface')).toHaveClass('cm-md-image-surface-block');
  expect(widget.querySelector('.cm-md-image-element')).toHaveClass('cm-md-image-element-block');
  expect(requestMeasure).toHaveBeenCalledTimes(1);
});

it('preserves explicit width while recording the intrinsic ratio', () => {
  const match = createMatch('block', 268);
  const widget = createMarkdownImageWidgetDom(match);

  finalizeMarkdownImageDisplay(widget, match, { height: 900, width: 1200 }, null);

  const surface = widget.querySelector<HTMLElement>('.cm-md-image-surface');
  expect(surface?.style.width).toBe('268px');
  expect(surface?.style.aspectRatio).toBe('1200 / 900');
});
