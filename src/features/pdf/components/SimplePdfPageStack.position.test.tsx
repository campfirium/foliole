import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { SimplePdfPageStack } from './SimplePdfPageStack';

vi.mock('./SimplePdfPage', () => ({ SimplePdfPage: MockPage }));
function MockPage(props: { pageNumber: number; cropBox: { bottom: number } | null; onCropBoxChange(box: { left: number; top: number; right: number; bottom: number }): void; onLayoutReady(): void }) {
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const timer = setTimeout(() => {
      latest.current.onCropBoxChange({ left: 0, top: 0, right: 400, bottom: 80 });
      latest.current.onLayoutReady();
    }, props.pageNumber === 35 ? 180 : 300 + (props.pageNumber % 5) * 100);
    return () => clearTimeout(timer);
  }, [props.pageNumber]);
  return <div data-page-height={props.cropBox ? 80 : 560}>Page {props.pageNumber}</div>;
}
function Harness({ initialPage = 35 }: { initialPage?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div ref={ref} data-testid="scroll"><SimplePdfPageStack initialPage={initialPage} totalPages={40} pageWidth={400} scrollRef={ref} /></div>;
}
function rowHeight(row: HTMLElement) {
  const page = row.querySelector<HTMLElement>('[data-page-height]');
  const minimum = Number.parseFloat(page?.parentElement?.style.minHeight ?? '') || 0;
  return Math.max(Number(page?.dataset.pageHeight ?? 0), minimum) + 12;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function installLayout(bounded = false) {
  const frames = new Map<number, FrameRequestCallback>();
  const scrollEvents = new Set<HTMLElement>();
  const offsets = new WeakMap<HTMLElement, number>();
  let frameId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (this: HTMLElement) { return offsets.get(this) ?? 0; });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (this: HTMLElement, value) {
    if (bounded) value = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight));
    if (value !== this.scrollTop) { offsets.set(this, value); scrollEvents.add(this); }
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-index') ? rowHeight(this) : 600; });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(375);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (!bounded) return 1240000;
    const list = this.querySelector<HTMLElement>('[data-virtual-list]');
    const padding = list?.parentElement?.style.paddingBottom ?? '0';
    // jsdom has no CSS layout; resolve the existing viewport-relative spacer as a browser would.
    const extra = padding.startsWith('calc') ? window.innerHeight - 12 * 16 : Number.parseFloat(padding);
    return Number.parseFloat(list?.style.height ?? '0') + extra;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const scroll = this.closest<HTMLElement>('[data-testid="scroll"]');
    const row = this.closest<HTMLElement>('[data-index]');
    const rowTop = Number.parseFloat(row?.style.top || '0') + Number(row?.style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1] ?? 0);
    const top = this === scroll ? 0 : rowTop - (scroll?.scrollTop ?? 0);
    const height = row ? rowHeight(row) : 600;
    return { top, bottom: top + height, height, width: 375, left: 0, right: 375, x: 0, y: top, toJSON() {} };
  });
  const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = options.top ?? 0; } });
  return { frames, scrollEvents, restore() {
    if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  } };
}

function installResizeObserver() {
  const observers = new Set<{ callback: ResizeObserverCallback; pending: Set<Element>; sizes: WeakMap<Element, number> }>();
  vi.stubGlobal('ResizeObserver', class {
    pending = new Set<Element>();
    sizes = new WeakMap<Element, number>();
    constructor(readonly callback: ResizeObserverCallback) { observers.add(this); }
    observe(element: Element) { this.pending.add(element); }
    unobserve(element: Element) { this.pending.delete(element); }
    disconnect() { observers.delete(this); }
  });
  return () => {
    for (const observer of observers) {
      const records = [...observer.pending].filter((target) => target.isConnected && observer.sizes.get(target) !== (target as HTMLElement).offsetHeight).map((target) => ({
        target, borderBoxSize: [{ blockSize: (target as HTMLElement).offsetHeight, inlineSize: 375 }],
        contentBoxSize: [{ blockSize: (target as HTMLElement).offsetHeight, inlineSize: 375 }],
        devicePixelContentBoxSize: [], contentRect: target.getBoundingClientRect()
      } as ResizeObserverEntry));
      records.forEach(({ target }) => observer.sizes.set(target, (target as HTMLElement).offsetHeight));
      if (records.length) observer.callback(records, {} as ResizeObserver);
    }
  };
}

it.each([0, 4])('keeps the deep search page visible after delayed target and neighboring page layouts settle with scroll delivery delayed %i frames', async (delay) => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
  const layout = installLayout();
  const deliverResize = installResizeObserver();
  try {
    render(<Harness />);
    for (let step = 0; step < 300; step++) {
      await act(async () => {
        if (step === 260) {
          expect(screen.getByText('Page 35').getBoundingClientRect().top).toBeCloseTo(0, 0);
          vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
          fireEvent(document, new Event('visibilitychange'));
        }
        const events = step % (delay + 1) === 0 ? [...layout.scrollEvents] : [];
        if (events.length) layout.scrollEvents.clear();
        for (const target of events) fireEvent.scroll(target);
        const callbacks = [...layout.frames.values()]; layout.frames.clear();
        for (const callback of callbacks) callback(step * 16);
        deliverResize();
        await vi.advanceTimersByTimeAsync(16);
      });
    }
    const target = screen.getByText('Page 35');
    const rect = target.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(-1);
    expect(rect.top).toBeLessThan(600);
  } finally { layout.restore(); }
});

it.each([35, 40])('keeps the final short page visible after opening page %i and scrolling to the bottom', async (initialPage) => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
  vi.stubGlobal('innerHeight', 874);
  const layout = installLayout(true);
  const deliverResize = installResizeObserver();
  try {
    render(<Harness initialPage={initialPage} />);
    const scroll = screen.getByTestId('scroll');
    for (let step = 0; step < 400; step++) {
      await act(async () => {
        if (step === 250 || step === 300) { fireEvent.touchStart(scroll); scroll.scrollTop += 100000; }
        const events = [...layout.scrollEvents]; layout.scrollEvents.clear();
        for (const target of events) fireEvent.scroll(target);
        const callbacks = [...layout.frames.values()]; layout.frames.clear();
        for (const callback of callbacks) callback(step * 16);
        deliverResize();
        await vi.advanceTimersByTimeAsync(16);
      });
    }
    const rect = screen.getByText('Page 40').getBoundingClientRect();
    expect(rect.bottom).toBeGreaterThan(0);
    expect(rect.top).toBeCloseTo(0, 0);
  } finally { layout.restore(); }
});
