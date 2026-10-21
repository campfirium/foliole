import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ID = 'large-input-latency';
const BODY = 'Ordinary paragraph with enough text for a large document.\n\n'.repeat(17500);
const INPUT = '012345678901234567890123456789';

test('measures real input frames and persists the complete large document', async ({ desktopWindow: page }) => {
  test.info().annotations.push({ type: 'calibrated-ms', description: String(120000) });
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{ id, content, kind: 'topic', title: 'Large input latency' }], { persist: true });
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, { id: ID, content: BODY });
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(BODY);
  const editor = page.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeEditable();
  await editor.click();
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0));
  await expect(editor).toBeFocused();
  await page.evaluate(() => {
    const samples: number[] = [], longTasks: number[] = [];
    const input = () => {
      const started = performance.now();
      requestAnimationFrame(() => samples.push(performance.now() - started));
    };
    const target = document.querySelector('.prompt-editor-host .cm-content')!;
    target.addEventListener('beforeinput', input);
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ type: 'longtask', buffered: false });
    Object.assign(window, { largeInputMeasurement: { samples, longTasks, stop() {
      target.removeEventListener('beforeinput', input); observer.disconnect();
    } } });
  });
  for (let index = 0; index < INPUT.length; index++) {
    if (index === 15) await page.waitForTimeout(1250);
    await page.keyboard.insertText(INPUT[index]!);
    await page.waitForTimeout(50);
  }
  try {
    await expect.poll(async () => (await loadNodeDocument(page, ID))?.content, { timeout: 15000 }).toBe(INPUT + BODY);
  } finally {
    const diagnostic = await page.evaluate(() => (window as unknown as { folioleEditorInputDiagnostics: { export(): unknown } }).folioleEditorInputDiagnostics.export());
    await mkdir('.tmp/artifacts/t357-single-wait', { recursive: true });
    await writeFile('.tmp/artifacts/t357-single-wait/input-diagnostic.json', JSON.stringify(diagnostic, null, 2));
  }
  const measurements = await page.evaluate(() => {
    const state = (window as unknown as { largeInputMeasurement: {
      samples: number[]; longTasks: number[]; stop(): void } }).largeInputMeasurement;
    state.stop();
    return { inputToFrameMs: state.samples, longTasksMs: state.longTasks };
  });
  expect(measurements.inputToFrameMs.length).toBe(INPUT.length);
  const sorted = [...measurements.inputToFrameMs].sort((a, b) => a - b);
  const result = { ...measurements, bytes: Buffer.byteLength(BODY), inputs: INPUT.length,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)], p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    maxMs: sorted.at(-1), finalBodyMatches: true, mode: 'hidden-native' };
  const destination = path.resolve('.tmp/artifacts/t357-single-wait/large-input-' + (process.env.FOLIOLE_INPUT_VARIANT ?? 'after') + '.json');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(result, null, 2));
});
