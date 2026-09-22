import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { CompanionListViewport, CompanionListViewportProvider } from './CompanionListViewport';

const entries = Array.from({ length: 10000 }, (_, index) => `topic-${index}`);
function Harness({ visible = true, estimate }: { visible?: boolean; estimate: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return <div ref={scrollRef} data-testid="scroll">
    <CompanionListViewportProvider scrollRef={scrollRef} sortIdentity="name">
      {visible ? <CompanionListViewport viewKey="directory" items={entries}
        getItemKey={(item) => item} estimateSize={() => estimate}
        renderItem={(item) => <button>{item}</button>} /> : <div>Reader</div>}
    </CompanionListViewportProvider>
  </div>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function installLayout() {
  const frames = new Map<number, FrameRequestCallback>();
  const scrollEvents = new Set<HTMLElement>();
  const offsets = new WeakMap<HTMLElement, number>();
  let frameId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (this: HTMLElement) { return offsets.get(this) ?? 0; });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (this: HTMLElement, value) {
    if (value !== this.scrollTop) { offsets.set(this, value); scrollEvents.add(this); }
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-index') ? 83 : 600; });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(375);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1240000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const scroll = this.closest<HTMLElement>('[data-testid="scroll"]');
    const row = this.closest<HTMLElement>('[data-index]');
    const top = this === scroll ? 0 : Number(row?.style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1] ?? 0) - (scroll?.scrollTop ?? 0);
    const height = row ? 83 : 600;
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
  const observers = new Set<{ callback: ResizeObserverCallback; pending: Set<Element> }>();
  vi.stubGlobal('ResizeObserver', class {
    pending = new Set<Element>();
    constructor(readonly callback: ResizeObserverCallback) { observers.add(this); }
    observe(element: Element) { this.pending.add(element); }
    unobserve(element: Element) { this.pending.delete(element); }
    disconnect() { observers.delete(this); }
  });
  return () => {
    for (const observer of observers) {
      const records = [...observer.pending].filter((target) => target.isConnected).map((target) => ({
        target, borderBoxSize: [{ blockSize: (target as HTMLElement).offsetHeight, inlineSize: 375 }],
        contentBoxSize: [{ blockSize: (target as HTMLElement).offsetHeight, inlineSize: 375 }],
        devicePixelContentBoxSize: [], contentRect: target.getBoundingClientRect()
      } as ResizeObserverEntry));
      observer.pending.clear();
      if (records.length) observer.callback(records, {} as ResizeObserver);
    }
  };
}

function visibleAnchor() {
  const first = screen.getAllByRole('button').find((button) => button.getBoundingClientRect().bottom > 0)!;
  return { topic: first.textContent, offset: first.getBoundingClientRect().top };
}

it.each([[83, 0], [124, 0], [124, 4]])('keeps the visible topic with estimate %i and scroll delivery delayed %i frames', async (estimate, delay) => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
  const layout = installLayout();
  const deliverResize = installResizeObserver();
  const settle = async () => {
    for (let step = 0; step < 16; step++) {
      await act(async () => {
        const events = step % (delay + 1) === 0 ? [...layout.scrollEvents] : [];
        if (events.length) layout.scrollEvents.clear();
        for (const target of events) fireEvent.scroll(target);
        const callbacks = [...layout.frames.values()]; layout.frames.clear();
        for (const callback of callbacks) callback(step * 16);
        deliverResize();
        await vi.advanceTimersByTimeAsync(16);
      });
    }
  };
  try {
    const view = render(<Harness estimate={estimate} />);
    await settle();
    const scroll = screen.getByTestId('scroll');
    expect(layout.frames.size).toBe(0);
    for (let step = 0; step < 12; step++) { scroll.scrollTop += 600; await settle(); }
    const before = visibleAnchor();
    view.rerender(<Harness estimate={estimate} visible={false} />);
    scroll.scrollTop = 0;
    await settle();
    view.rerender(<Harness estimate={estimate} />);
    await settle();
    expect(visibleAnchor()).toEqual(before);
    expect(layout.frames.size).toBe(0);
    scroll.scrollTop += 600;
    await settle();
    const advanced = visibleAnchor();
    expect(advanced.topic).not.toBe(before.topic);
    view.rerender(<Harness estimate={estimate} />);
    await settle();
    expect(visibleAnchor()).toEqual(advanced);
  } finally { layout.restore(); }
});
