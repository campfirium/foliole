import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const BAND_FOLLOW_SCREENSHOT = path.resolve(
  '.tmp/artifacts/desktop-acceptance/immersive-reading-band-follow.png'
);
const SCROLLABLE_TOPIC_ID = 'playwright-immersive-scroll-follow';

async function openScrollableDocument(desktopWindow: Parameters<typeof test>[0]['desktopWindow']) {
  if (await desktopWindow.locator('div.fixed.inset-0.z-40').count()) {
    await desktopWindow.keyboard.press('Escape');
    await desktopWindow.waitForTimeout(150);
  }
  await desktopWindow.evaluate(async (nodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const content = Array.from(
      { length: 120 },
      (_, index) => `Paragraph ${index + 1} keeps immersive reading long enough to verify banded keyboard following.`
    ).join('\n\n');
    await api?.seedNodes?.([{ content, id: nodeId, kind: 'topic', title: 'Immersive Band Follow' }]);
    await api?.openNode?.(nodeId);
  }, SCROLLABLE_TOPIC_ID);
  await desktopWindow.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor').includes('Paragraph 120') ?? false
  )).toBe(true);
  await desktopWindow.evaluate(() => {
    globalThis.window?.__folioleDebug?.clearTraces?.();
  });
}

async function collectBeforeToggleMetrics(desktopWindow: Parameters<typeof test>[0]['desktopWindow']) {
  return desktopWindow.evaluate(async () => {
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    if (!(scroller instanceof HTMLElement)) {
      return { reason: 'missing-scroller' };
    }

    scroller.scrollTop = Math.max(0, scroller.scrollHeight * 0.72);
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 200));

    const rect = scroller.getBoundingClientRect();
    const anchorY = rect.top + rect.height * 0.15;
    const lines = Array.from(document.querySelectorAll('.prompt-editor-host .cm-line'))
      .map((line) => {
        const element = line as HTMLElement;
        const lineRect = element.getBoundingClientRect();
        return {
          distance: Math.abs((lineRect.top + lineRect.bottom) / 2 - anchorY),
          text: (element.textContent ?? '').trim()
        };
      })
      .filter((line) => line.text.length > 0)
      .sort((left, right) => left.distance - right.distance);

    return {
      anchorLineText: lines[0]?.text ?? null,
      scrollTop: scroller.scrollTop,
      visibleLines: lines.slice(0, 6).map((line) => line.text)
    };
  });
}

async function wheelScrollEditor(desktopWindow: Parameters<typeof test>[0]['desktopWindow']) {
  const editor = desktopWindow.locator('.prompt-editor-host .cm-scroller');
  const box = await editor.boundingBox();
  if (!box) {
    throw new Error('missing editor box');
  }
  await desktopWindow.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let index = 0; index < 14; index += 1) {
    await desktopWindow.mouse.wheel(0, 900);
    await desktopWindow.waitForTimeout(80);
  }
}

async function collectAfterToggleMetrics(desktopWindow: Parameters<typeof test>[0]['desktopWindow']) {
  return desktopWindow.evaluate(() => {
    const debugApi = globalThis.window?.__folioleDebug;
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    const editor = document.querySelector('.prompt-editor-host .cm-editor') as HTMLElement | null;
    const lines = Array.from(document.querySelectorAll('.prompt-editor-host .cm-line')) as HTMLElement[];
    const markedParagraphLine =
      lines.find((line) => line.classList.contains('cm-paragraph-marker-line') && (line.textContent ?? '').trim().length > 0) ?? null;
    return {
      editorSelection: debugApi?.getEditorSelection?.('prompt-editor') ?? null,
      paragraphMarkerActive: editor?.dataset.paragraphMarkerActive ?? null,
      markedParagraphText: markedParagraphLine?.textContent?.trim() ?? null,
      immersiveChromeHidden: !document.querySelector('[aria-label="Window controls"]'),
      loadingVisible: Boolean(document.querySelector('[aria-label="Loading document"]')),
      markedVisibleLines: lines
        .filter((line) => line.classList.contains('cm-paragraph-marker-line'))
        .map((line) => (line.textContent ?? '').trim())
        .filter((text) => text.length > 0)
        .slice(0, 6),
      scrollTop: scroller?.scrollTop ?? null,
      traces: debugApi?.getTraces?.() ?? []
    };
  });
}

async function attachMetrics(testInfo: Parameters<typeof test>[1], name: string, metrics: unknown) {
  await testInfo.attach(name, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
}

function normalizeVisibleLine(text: string | null | undefined) {
  return (text ?? '')
    .trim()
    .replace(/^[*-]\s+/, '• ')
    .replace(/\s+/g, ' ');
}

async function readMarkerViewportMetrics(desktopWindow: Parameters<typeof test>[0]['desktopWindow']) {
  return desktopWindow.evaluate(() => {
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    const markedLine = Array.from(document.querySelectorAll('.prompt-editor-host .cm-paragraph-marker-line'))
      .find((line) => (line.textContent ?? '').trim().length > 0) as HTMLElement | undefined;
    if (!scroller || !markedLine) return null;
    const viewportRect = scroller.getBoundingClientRect();
    const markerRect = markedLine.getBoundingClientRect();
    return {
      markerTopRatio: (markerRect.top - viewportRect.top) / viewportRect.height,
      scrollTop: scroller.scrollTop
    };
  });
}

async function sampleScrollTransition(desktopWindow: Parameters<typeof test>[0]['desktopWindow']) {
  return desktopWindow.evaluate(async () => {
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
    if (!scroller) return [];
    const samples: Array<{ elapsedMs: number; scrollTop: number }> = [];
    let startedAt: number | null = null;
    await new Promise<void>((resolve) => {
      const sampleFrame = (timestamp: number) => {
        if (startedAt === null) startedAt = timestamp;
        samples.push({ elapsedMs: timestamp - startedAt, scrollTop: scroller.scrollTop });
        if (samples.length >= 40) {
          resolve();
          return;
        }
        requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
    });
    return samples;
  });
}

test('keeps immersive reading at the current viewport after scrolling in editor mode', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await openScrollableDocument(desktopWindow);
  await wheelScrollEditor(desktopWindow);

  const beforeToggle = await collectBeforeToggleMetrics(desktopWindow);
  await desktopWindow.keyboard.press('F11');
  await desktopWindow.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  await desktopWindow.waitForTimeout(300);
  const afterToggle = await collectAfterToggleMetrics(desktopWindow);

  await attachMetrics(testInfo, 'immersive-scroll-sync-before-toggle', beforeToggle);
  await attachMetrics(testInfo, 'immersive-scroll-sync-after-toggle', afterToggle);

  expect(afterToggle.immersiveChromeHidden).toBe(true);
  expect(afterToggle.loadingVisible).toBe(false);
  expect(beforeToggle.anchorLineText).toBeTruthy();
  expect(afterToggle.markedVisibleLines.map((line) => normalizeVisibleLine(line))).toContain(
    normalizeVisibleLine(beforeToggle.anchorLineText)
  );
});

test('moves downward reading from the lower trigger back near the top of the reading band', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await openScrollableDocument(desktopWindow);
  await desktopWindow.locator('.prompt-editor-host .cm-scroller').evaluate((scroller) => {
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
  });
  await desktopWindow.waitForTimeout(200);
  await desktopWindow.keyboard.press('F11');

  let metrics = await readMarkerViewportMetrics(desktopWindow);
  let transitionSamples: Array<{ elapsedMs: number; scrollTop: number }> = [];
  for (let index = 0; index < 30 && (!metrics || metrics.scrollTop <= 0); index += 1) {
    const previousScrollTop = metrics?.scrollTop ?? 0;
    await desktopWindow.keyboard.press('ArrowDown');
    const samples = await sampleScrollTransition(desktopWindow);
    metrics = await readMarkerViewportMetrics(desktopWindow);
    if ((metrics?.scrollTop ?? 0) > previousScrollTop) {
      transitionSamples = [{ elapsedMs: 0, scrollTop: previousScrollTop }, ...samples];
    }
  }

  expect(metrics?.scrollTop).toBeGreaterThan(0);
  expect(metrics?.markerTopRatio).toBeGreaterThan(0.1);
  expect(metrics?.markerTopRatio).toBeLessThan(0.25);
  const transitionStart = transitionSamples[0]?.scrollTop ?? 0;
  const transitionEnd = transitionSamples.at(-1)?.scrollTop ?? transitionStart;
  expect(transitionEnd).toBeGreaterThan(transitionStart);
  expect(
    transitionSamples.some((sample) => sample.scrollTop > transitionStart + 1 && sample.scrollTop < transitionEnd - 1)
  ).toBe(true);
  const earlySample = transitionSamples.find((sample) => sample.elapsedMs >= 100);
  expect(((earlySample?.scrollTop ?? transitionStart) - transitionStart) / (transitionEnd - transitionStart)).toBeLessThan(0.25);
  const finalPositionReachedAt = transitionSamples.find(
    (sample) => Math.abs(sample.scrollTop - transitionEnd) < 1
  )?.elapsedMs;
  expect(finalPositionReachedAt).toBeGreaterThanOrEqual(400);
  const followedMetrics = metrics;
  await desktopWindow.keyboard.press('ArrowDown');
  await desktopWindow.waitForTimeout(300);
  metrics = await readMarkerViewportMetrics(desktopWindow);
  expect(metrics?.markerTopRatio).toBeGreaterThan(followedMetrics?.markerTopRatio ?? 0);
  expect(metrics?.markerTopRatio).toBeLessThan(0.7);
  expect(metrics?.scrollTop).toBeCloseTo(followedMetrics?.scrollTop ?? 0, 0);

  await mkdir(path.dirname(BAND_FOLLOW_SCREENSHOT), { recursive: true });
  await desktopWindow.screenshot({ path: BAND_FOLLOW_SCREENSHOT });
  await testInfo.attach('immersive-reading-band-follow', {
    contentType: 'image/png',
    path: BAND_FOLLOW_SCREENSHOT
  });
});
