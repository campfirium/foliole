import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function openScrollableDocument(desktopWindow: Parameters<typeof test>[0]['desktopWindow']) {
  if (await desktopWindow.locator('div.fixed.inset-0.z-40').count()) {
    await desktopWindow.keyboard.press('Escape');
    await desktopWindow.waitForTimeout(150);
  }
  await desktopWindow.getByRole('treeitem', { name: /GTD 项目管理方法/ }).first().click();
  await expect(desktopWindow.getByRole('button', { name: 'GTD 项目管理方法', exact: true })).toBeVisible();
  await desktopWindow.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
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
