/**
 * Records whether the reading body has rendered blocks inside the visible screen while an Android
 * support recording runs. Only derived counts and pixel geometry reach the report; never text or ids.
 * A `lines` sample while the user sees a blank body points at WebView paint loss; `gap` or `empty`
 * points at the editor's own viewport rendering.
 */
export const readerVisibilityStates = ['none', 'lines', 'gap', 'empty'] as const;
export const readerVisibilityLimits = { samples: 200, recordingMs: 300_000, pixels: 10_000_000 } as const;

type State = typeof readerVisibilityStates[number];
export type ReaderVisibilitySample = {
  atMs: number; state: State; editors: number; blocksInView: number; gapsInView: number; renderedBlocks: number;
  contentHeight: number; scrollTop: number; scrollHeight: number; visibleHeight: number;
};
export type AndroidReaderReport = { webViewMajor: number | null; samples: ReaderVisibilitySample[]; omitted: number };

const sampleIntervalMs = 1_000;
const heartbeatMs = 5_000;
const scrollThrottleMs = 250;
const editorSelector = '[data-companion-article-document] .cm-editor';
const sampleKeys = 10;

type Capture = { startedAt: number; samples: ReaderVisibilitySample[]; omitted: number; lastAt: number; lastKey: string;
  scrollPending: boolean; cleanup: (() => void)[] };
let capture: Capture | undefined;

export function startAndroidReaderVisibility() {
  stopCapture();
  if (typeof document === 'undefined') return;
  const session: Capture = capture = { startedAt: performance.now(), samples: [], omitted: 0, lastAt: -Infinity,
    lastKey: '', scrollPending: false, cleanup: [] };
  const timer = setInterval(() => sample(session), sampleIntervalMs);
  const onScroll = () => {
    if (session.scrollPending) return;
    session.scrollPending = true;
    setTimeout(() => { session.scrollPending = false; sample(session); }, scrollThrottleMs);
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  session.cleanup.push(() => clearInterval(timer), () => document.removeEventListener('scroll', onScroll, { capture: true }));
  sample(session);
}

export function stopAndroidReaderVisibility(): AndroidReaderReport | undefined {
  const session = capture;
  if (session?.samples.length) sample(session, true);
  stopCapture();
  if (!session?.samples.length) return;
  return { webViewMajor: readWebViewMajor(), samples: session.samples, omitted: session.omitted };
}

function stopCapture() {
  const session = capture;
  capture = undefined;
  session?.cleanup.splice(0).forEach(cleanup => cleanup());
}

function sample(session: Capture, force = false) {
  if (capture !== session) return;
  const atMs = Math.max(0, Math.round(performance.now() - session.startedAt));
  if (atMs > readerVisibilityLimits.recordingMs) return;
  const facts = readFacts();
  const key = `${facts.state}:${facts.editors}`;
  if (!force && key === session.lastKey && atMs - session.lastAt < heartbeatMs) return;
  if (facts.state === 'none' && session.lastKey === '') return;
  session.lastKey = key;
  session.lastAt = atMs;
  if (session.samples.length === readerVisibilityLimits.samples) session.omitted++;
  else session.samples.push({ atMs, ...facts });
}

function readFacts(): Omit<ReaderVisibilitySample, 'atMs'> {
  const editors = [...document.querySelectorAll<HTMLElement>(editorSelector)];
  const screen = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const blank = { editors: editors.length, blocksInView: 0, gapsInView: 0, renderedBlocks: 0, contentHeight: 0,
    scrollTop: 0, scrollHeight: 0, visibleHeight: 0 };
  for (const editor of editors) {
    const visible = clip(editor, screen);
    if (!visible) continue;
    const scroller = scrollParent(editor);
    const geometry = { ...blank, visibleHeight: px(visible.bottom - visible.top),
      scrollTop: px(scroller?.scrollTop ?? 0), scrollHeight: px(scroller?.scrollHeight ?? 0) };
    const content = editor.querySelector<HTMLElement>('.cm-content');
    const blocks = content ? [...content.children] : [];
    let blocksInView = 0;
    let gapsInView = 0;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (rect.bottom <= visible.top || rect.top >= visible.bottom || rect.height === 0) continue;
      if (block.classList.contains('cm-gap')) gapsInView++;
      else blocksInView++;
    }
    const state: State = blocksInView > 0 ? 'lines' : gapsInView > 0 ? 'gap' : 'empty';
    return { state, ...geometry, blocksInView, gapsInView, renderedBlocks: blocks.length,
      contentHeight: px(content?.getBoundingClientRect().height ?? 0) };
  }
  return { state: 'none', ...blank };
}

function clip(element: HTMLElement, screen: { top: number; bottom: number; left: number; right: number }) {
  const rect = element.getBoundingClientRect();
  let top = Math.max(rect.top, screen.top);
  let bottom = Math.min(rect.bottom, screen.bottom);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (!clips(parent)) continue;
    const bounds = parent.getBoundingClientRect();
    top = Math.max(top, bounds.top);
    bottom = Math.min(bottom, bounds.bottom);
  }
  return bottom - top >= 1 && rect.right > screen.left && rect.left < screen.right ? { top, bottom } : null;
}

function clips(element: HTMLElement) {
  const overflow = getComputedStyle(element).overflowY;
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden' || overflow === 'clip';
}

function scrollParent(element: HTMLElement) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight && clips(parent)) return parent;
  }
  return document.scrollingElement as HTMLElement | null;
}

function readWebViewMajor() {
  const major = Number(/Chrome\/(\d+)\./u.exec(navigator.userAgent)?.[1]);
  return Number.isSafeInteger(major) && major > 0 && major < 1_000 ? major : null;
}

function px(value: number) {
  return Math.min(readerVisibilityLimits.pixels, Math.max(0, Math.round(value)));
}

export function validateAndroidReaderVisibility(value: unknown): value is AndroidReaderReport {
  if (!isRecord(value, 3)) return false;
  const report = value as AndroidReaderReport;
  return (report.webViewMajor === null || (count(report.webViewMajor) && report.webViewMajor < 1_000))
    && count(report.omitted) && Array.isArray(report.samples)
    && report.samples.length <= readerVisibilityLimits.samples && report.samples.every(validSample);
}

function validSample(entry: ReaderVisibilitySample) {
  return isRecord(entry, sampleKeys) && readerVisibilityStates.includes(entry.state)
    && count(entry.atMs) && entry.atMs <= readerVisibilityLimits.recordingMs
    && [entry.editors, entry.blocksInView, entry.gapsInView, entry.renderedBlocks].every(count)
    && [entry.contentHeight, entry.scrollTop, entry.scrollHeight, entry.visibleHeight]
      .every(value => count(value) && value <= readerVisibilityLimits.pixels);
}

function isRecord(value: unknown, keys: number): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === keys;
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
