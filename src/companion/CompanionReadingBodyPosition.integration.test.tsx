import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

// #313: on Android the reading body must not move when the reading toolbars are shown, hidden or unmounted.
vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' },
    registerPlugin: (name: string) => {
      const plugin = actual.registerPlugin<object>(name);
      return name === 'FolioleCompanionBootstrap' ? new Proxy(plugin, { get(target, key) {
        return key === 'setReadingSystemBars' ? async () => undefined : Reflect.get(target, key);
      } }) : plugin;
    } };
});
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: async () => () => undefined }));
vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Reading body</p> }));

const REM = 16;
const TAILWIND_HEIGHT = /(?:^|\s)h-(\d+)(?:\s|$)/;

// jsdom has no layout: a toolbar band is as tall as its tallest fixed-height child (buttons or the hidden-controls spacer).
function bandBottom(element: Element) {
  return [element, ...element.querySelectorAll('*')].reduce((tallest, child) => {
    const match = TAILWIND_HEIGHT.exec(child.getAttribute('class') ?? '');
    return match ? Math.max(tallest, Number(match[1]) * REM / 4) : tallest;
  }, 0);
}

// Resolve the body's top boundary the way the browser would with no safe-area inset or system chrome.
function bodyTop(): number {
  const surface = document.querySelector<HTMLElement>('[data-reading-selection-viewport="true"]');
  expect(surface).not.toBeNull();
  const value = surface!.style.getPropertyValue('--companion-reading-chrome-bottom');
  const expression = value
    .replace(/env\([^)]*\)/g, '0px')
    .replace(/var\([^)]*\)/g, '0px')
    .replace(/([\d.]+)rem/g, (_, n: string) => `${Number(n) * REM}`)
    .replace(/([\d.]+)px/g, '$1')
    .replace(/calc/g, '')
    .replace(/max/g, 'Math.max');
  if (!/^[\d\s.+\-*/(),Mathmax]*$/.test(expression)) throw new Error(`Unresolvable body top: ${value}`);
  return Number(new Function(`return ${expression};`)());
}

function article() {
  return <ImmersiveReadableArticle onExit={() => undefined} snapshot={null}
    readableArticle={{ content: 'Reading body', hideTitleHeading: false, nodeId: 'first', persistedNodeViewState: null,
      pdfAttachmentId: null, textAnchorDecorations: [], title: 'First' }} />;
}

const toggleToolbars = () => act(() => { fireEvent.click(screen.getByText('Reading body')); });

beforeEach(() => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (!this.classList.contains('companion-reading-top-chrome')) return original.call(this);
    const bottom = bandBottom(this);
    return { x: 0, y: 0, top: 0, left: 0, right: 360, width: 360, bottom, height: bottom, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it.each([
  ['docked toolbars', {}],
  ['floating toolbars', { overlayToolbars: true }]
])('keeps the reading body still while toggling %s', async (_, display) => {
  localStorage.setItem('foliole-companion-reading-display', JSON.stringify(display));
  render(article());
  const hidden = bodyTop();
  expect(hidden).toBeGreaterThan(0);
  await toggleToolbars();
  expect(screen.getByRole('button', { name: 'More reading actions' })).toBeInTheDocument();
  expect(bodyTop()).toBe(hidden);
  await toggleToolbars();
  expect(screen.queryByRole('button', { name: 'More reading actions' })).not.toBeInTheDocument();
  expect(bodyTop()).toBe(hidden);
});
