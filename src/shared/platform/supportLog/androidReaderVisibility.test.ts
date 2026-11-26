import { afterEach, expect, it, vi } from 'vitest';

import { validateAndroidReaderVisibility } from './androidReaderVisibility';
import { serializeSupportLog, startSupportLog, stopSupportLog } from './supportLog';

vi.mock('../companionRuntimeCapabilities', () => ({ getCompanionRuntimeCapability: () => ({ kind: 'android-native' }) }));

afterEach(() => {
  stopSupportLog();
  localStorage.clear();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function rect(top: number, height: number) {
  return { top, bottom: top + height, left: 0, right: 360, width: 360, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

function mountReader(blocks: { gap?: boolean; top: number; height: number }[]) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  scroller.getBoundingClientRect = () => rect(60, 600);
  Object.defineProperties(scroller, { scrollTop: { value: 4_000 }, scrollHeight: { value: 12_000 }, clientHeight: { value: 600 } });
  const article = document.createElement('section');
  article.dataset.companionArticleDocument = 'true';
  const editor = document.createElement('div');
  editor.className = 'cm-editor';
  editor.getBoundingClientRect = () => rect(-4_000, 11_000);
  const content = document.createElement('div');
  content.className = 'cm-content';
  content.getBoundingClientRect = () => rect(-4_000, 11_000);
  for (const block of blocks) {
    const element = document.createElement('div');
    element.className = block.gap ? 'cm-gap' : 'cm-line';
    element.textContent = 'private body text';
    element.getBoundingClientRect = () => rect(block.top, block.height);
    content.append(element);
  }
  editor.append(content);
  article.append(editor);
  scroller.append(article);
  document.body.append(scroller);
  return content;
}

it('records when the visible reading area holds only editor gaps, without body text', () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  const content = mountReader([{ top: 100, height: 40 }, { top: 140, height: 40 }]);
  startSupportLog(false, true);
  vi.advanceTimersByTime(1_000);
  content.replaceChildren();
  const gap = document.createElement('div');
  gap.className = 'cm-gap';
  gap.getBoundingClientRect = () => rect(-4_000, 11_000);
  content.append(gap);
  vi.advanceTimersByTime(1_000);
  stopSupportLog();

  const text = serializeSupportLog('android')!;
  expect(text).not.toContain('private');
  const report = JSON.parse(text).androidReader;
  expect(validateAndroidReaderVisibility(report)).toBe(true);
  expect(report.samples.map((sample: { state: string }) => sample.state)).toEqual(['lines', 'gap', 'gap']);
  expect(report.samples[1]).toMatchObject({ atMs: 2_000, editors: 1, blocksInView: 0, gapsInView: 1, renderedBlocks: 1,
    scrollTop: 4_000, scrollHeight: 12_000, visibleHeight: 600 });
  expect(JSON.parse(serializeSupportLog('desktop')!)).not.toHaveProperty('androidReader');
});

it('leaves the report out when no reading body appeared during the recording', () => {
  startSupportLog(false, true);
  stopSupportLog();
  expect(JSON.parse(serializeSupportLog('android')!)).not.toHaveProperty('androidReader');
});

it('rejects samples carrying anything beyond the counted fields', () => {
  const sample = { atMs: 0, state: 'lines', editors: 1, blocksInView: 1, gapsInView: 0, renderedBlocks: 3, contentHeight: 900,
    scrollTop: 0, scrollHeight: 900, visibleHeight: 600 };
  expect(validateAndroidReaderVisibility({ webViewMajor: 131, omitted: 0, samples: [sample] })).toBe(true);
  expect(validateAndroidReaderVisibility({ webViewMajor: 131, omitted: 0, samples: [{ ...sample, text: 'x' }] })).toBe(false);
  expect(validateAndroidReaderVisibility({ webViewMajor: 131, omitted: 0, samples: [{ ...sample, state: 'node-id' }] })).toBe(false);
  expect(validateAndroidReaderVisibility({ webViewMajor: 'Chrome', omitted: 0, samples: [] })).toBe(false);
});
