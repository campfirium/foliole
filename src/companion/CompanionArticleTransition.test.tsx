import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useCompanionArticleExit } from './CompanionArticleTransition';
import { CompanionPageStack } from './CompanionPageStack';
import type { CompanionShellModel } from './CompanionShell';

type AnimationSample = {
  target: HTMLElement; cancel: ReturnType<typeof vi.fn<() => void>>; finish(): void; keyframes: Keyframe[]; options: KeyframeAnimationOptions;
};
const samples: AnimationSample[] = [];
const readerSamples = () => samples.filter(sample => sample.target.hasAttribute('data-companion-article-transition'));
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
let reduced = false;
beforeEach(() => {
  reduced = false;
  samples.length = 0;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced }) as MediaQueryList));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true,
    value: function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const deferred = Promise.withResolvers<void>();
      const cancel = vi.fn(() => deferred.reject(new DOMException('Cancelled', 'AbortError')));
      samples.push({ target: this, cancel, finish: () => deferred.resolve(), keyframes, options });
      return { cancel, finished: deferred.promise };
    }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

function Reader(props: { ready: boolean; onExit(): void }) {
  const exit = useCompanionArticleExit(props.onExit);
  return <article>
    {props.ready ? <p>Article body</p> : <p aria-busy="true">Article title</p>}
    <button onClick={exit}>Back to list</button>
  </article>;
}

function Navigation(props: { ready?: boolean; flow?: boolean; destinationReady?: Promise<void> }) {
  const [reading, setReading] = useState(false);
  const model = { surface: { activeAction: props.flow ? 'review' : 'recent' }, floatingBar: {} } as CompanionShellModel;
  return <CompanionPageStack model={model} pageKey={props.flow ? null : 'recent'} reading={reading}
    content={reading ? <Reader ready={props.ready ?? true} onExit={() => {
      if (props.destinationReady) void props.destinationReady.then(() => setReading(false));
      else setReading(false);
    }} />
      : <button onClick={() => setReading(true)}>Open article</button>} />;
}

async function finish(sample: AnimationSample) {
  await act(async () => { sample.finish(); });
}

it('slides in while loading, keeps the list inert underneath, and returns to its retained scroll position', async () => {
  const view = render(<Navigation ready={false} />);
  const row = screen.getByRole('button', { name: 'Open article' });
  const list = screen.getByTestId('companion-scroll-container');
  list.scrollTop = 400;
  fireEvent.click(row);
  expect(readerSamples()[0]!.keyframes).toEqual([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }]);
  expect(list).toHaveAttribute('inert');
  expect(list).toHaveAttribute('aria-hidden', 'true');
  expect(list).toBeVisible();
  const arrival = samples.find(sample => sample.target === list)!;
  expect(arrival.keyframes.at(-1)).toEqual({ transform: 'translateX(-20%)' });
  expect(arrival.options.duration).toBe(readerSamples()[0]!.options.duration);
  expect(screen.queryByRole('button', { name: 'Open article' })).not.toBeInTheDocument();

  view.rerender(<Navigation ready />);
  expect(screen.getByText('Article body')).toBeVisible();
  expect(readerSamples()).toHaveLength(1);
  await finish(readerSamples()[0]!);
  expect(list).not.toBeVisible();
  expect(list).toHaveStyle({ transform: 'translateX(-20%)' });
  fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));
  expect(readerSamples()[1]!.keyframes.at(-1)).toEqual({ transform: 'translateX(100%)' });
  expect(list).toBeVisible();
  const departure = samples.filter(sample => sample.target === list).at(-1)!;
  expect(departure.keyframes).toEqual([{ transform: 'translateX(-20%)' }, { transform: 'translateX(0)' }]);
  expect(departure.options.duration).toBe(readerSamples()[1]!.options.duration);
  expect(screen.queryByRole('button', { name: 'Open article' })).not.toBeInTheDocument();
  await finish(readerSamples()[1]!);
  expect(screen.getByRole('button', { name: 'Open article' })).toBe(row);
  expect(screen.getByTestId('companion-scroll-container')).toBe(list);
  expect(list.scrollTop).toBe(400);
  expect(list.style.transform).toBe('');
  expect(screen.queryByText('Article body')).not.toBeInTheDocument();
});

it('reverses an unfinished arrival and ignores repeated back presses', async () => {
  render(<Navigation />);
  fireEvent.click(screen.getByRole('button', { name: 'Open article' }));
  const back = screen.getByRole('button', { name: 'Back to list' });
  fireEvent.click(back);
  fireEvent.click(back);
  expect(readerSamples()[0]!.cancel).toHaveBeenCalledOnce();
  expect(readerSamples()).toHaveLength(2);
  await finish(readerSamples()[1]!);
  expect(screen.getByRole('button', { name: 'Open article' })).toBeVisible();
});

it('keeps the revealed list and the departed reader in place until the destination commits', async () => {
  const destination = Promise.withResolvers<void>();
  render(<Navigation destinationReady={destination.promise} />);
  const row = screen.getByRole('button', { name: 'Open article' });
  const list = screen.getByTestId('companion-scroll-container');
  list.scrollTop = 320;
  fireEvent.click(row);
  await finish(readerSamples()[0]!);
  const back = screen.getByRole('button', { name: 'Back to list' });
  fireEvent.click(back);
  await finish(readerSamples()[1]!);

  expect(list).toBeVisible();
  expect(list).toHaveAttribute('inert');
  expect(list).toHaveStyle({ transform: 'translateX(0)' });
  expect(document.querySelector('[data-companion-article-transition]')).toHaveStyle({ transform: 'translateX(100%)' });
  fireEvent.click(back);
  expect(readerSamples()).toHaveLength(2);
  await act(async () => { destination.resolve(); });
  expect(screen.getByRole('button', { name: 'Open article' })).toBe(row);
  expect(screen.getByTestId('companion-scroll-container')).toBe(list);
  expect(list.scrollTop).toBe(320);
  expect(screen.queryByText('Article body')).not.toBeInTheDocument();
});

it.each([true, false])('navigates immediately without sliding for reduced motion=%s or Flow', reducedMotion => {
  reduced = reducedMotion;
  render(<Navigation flow={!reducedMotion} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open article' }));
  expect(screen.getByText('Article body')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));
  expect(screen.getByRole('button', { name: 'Open article' })).toBeVisible();
  expect(samples).toHaveLength(0);
});

it('does not complete an old departure after the reader is unmounted', async () => {
  const view = render(<Navigation />);
  fireEvent.click(screen.getByRole('button', { name: 'Open article' }));
  await finish(readerSamples()[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));
  view.unmount();
  await finish(readerSamples()[1]!);
  expect(readerSamples()[1]!.cancel).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Open article' })).not.toBeInTheDocument();
});

it('still returns to the list if the browser cancels the departure', async () => {
  render(<Navigation />);
  fireEvent.click(screen.getByRole('button', { name: 'Open article' }));
  await finish(readerSamples()[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));
  await act(async () => { readerSamples()[1]!.cancel(); });
  expect(screen.getByRole('button', { name: 'Open article' })).toBeVisible();
});
