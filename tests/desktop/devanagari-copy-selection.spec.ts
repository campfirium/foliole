import process from 'node:process';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TEXT = 'बिजौलिया जो वर्तमान में भीलवाड़ा जिले में स्थित है';
const TOPIC_ID = 'devanagari-copy-selection';

async function getParagraphDragPoints(page: Page, startFraction: number) {
  return page.locator('.prompt-editor-host .cm-line').first().evaluate((line, fraction) => {
    const node = line.firstChild;
    if (!(node instanceof Text)) throw new Error('Expected plain editor text');
    const firstCluster = new Intl.Segmenter('hi', { granularity: 'grapheme' })
      .segment(node.textContent ?? '')[Symbol.iterator]().next().value?.segment;
    if (!firstCluster) throw new Error('Missing first grapheme');
    const first = document.createRange();
    first.setStart(node, 0);
    first.setEnd(node, firstCluster.length);
    const whole = document.createRange();
    whole.selectNodeContents(line);
    const firstBox = first.getBoundingClientRect();
    const wholeBox = whole.getBoundingClientRect();
    return { startX: firstBox.left + firstBox.width * fraction, endX: wholeBox.right + 4, y: firstBox.top + firstBox.height / 2 };
  }, startFraction);
}

async function dragParagraph(page: Page, fraction: number) {
  const points = await getParagraphDragPoints(page, fraction);
  await page.mouse.move(points.startX, points.y);
  await page.mouse.down();
  await page.mouse.move(points.endX, points.y, { steps: 8 });
  await page.mouse.up();
}

test('drag copying a Devanagari syllable preserves its consonant on paste', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async ({ content, id }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{ content, id, kind: 'topic', title: 'Devanagari copy' }]);
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, { content: TEXT, id: TOPIC_ID });
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
  )).toBe(TEXT);

  await desktopApp.evaluate(async ({ clipboard }) => {
    const root = globalThis as typeof globalThis & { devanagariClipboardBackup?: Record<string, Blob>[] };
    root.devanagariClipboardBackup = await Promise.all((await clipboard.read()).map(async (item) =>
      Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await item.getType(type)])))
    ));
  });
  try {
    await dragParagraph(desktopWindow, 0.25);
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(TEXT);

    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await expect.poll(() => desktopWindow.evaluate(() =>
      window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
    )).toBe(TEXT);
    await desktopWindow.screenshot({ path: '.tmp/artifacts/devanagari-copy-selection.png' });
  } finally {
    await desktopApp.evaluate(async ({ ClipboardItem, clipboard }) => {
      const root = globalThis as typeof globalThis & { devanagariClipboardBackup?: Record<string, Blob>[] };
      const payloads = root.devanagariClipboardBackup;
      if (!payloads) throw new Error('Clipboard backup missing');
      if (payloads.length) await clipboard.write(payloads.map((payload) => new ClipboardItem(payload)));
      else clipboard.clear();
      delete root.devanagariClipboardBackup;
    });
  }
});

test('dragging a Hindi paragraph into an extract keeps its first syllable', async ({ desktopWindow }) => {
  const paragraph = 'बिजौलिया जो वर्तमान में भीलवाड़ा जिले में स्थित है, मेवाड़ राज्य में प्रथम श्रेणी का ठिकाना था।';
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (content) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.(
      Array.from({ length: 5 }, (_, index) => ({
        content, id: `devanagari-extract-${index}`, kind: 'topic' as const,
        title: `Devanagari extract devanagari-extract-${index}`
      })),
      { persist: true }
    );
  }, paragraph);
  for (const [index, fraction] of [0.1, 0.16, 0.22, 0.28, 0.34].entries()) {
    const id = `devanagari-extract-${index}`;
    await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), id);
    await expect.poll(() => desktopWindow.evaluate(() =>
      window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
    )).toBe(paragraph);

    await dragParagraph(desktopWindow, fraction);
    expect(await desktopWindow.evaluate(() =>
      window.__folioleDebug?.getEditorSelection?.('prompt-editor') ?? null
    )).toEqual({ from: 0, to: paragraph.length });
    const toolbar = desktopWindow.locator('[data-annotation-toolbar="true"]');
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole('button', { name: 'Highlight' }).click();
    await expect.poll(() => desktopWindow.evaluate((nodeId) => {
      const debug = window.__folioleWorkspaceDebug;
      return debug?.listNodes().map((node) => debug.getNode(node.id)).filter((node) =>
        node?.parentNodeId === nodeId && node.anchorLink?.kind === 'highlight'
      ).map((node) => ({ content: node!.content, locator: node!.anchorLink?.locator })) ?? [];
    }, id)).toEqual([{
      content: paragraph,
      locator: expect.objectContaining({ from: 0, originalText: paragraph })
    }]);

    const childId = await desktopWindow.evaluate((nodeId) => {
      const debug = window.__folioleWorkspaceDebug;
      return debug?.listNodes().find((node) => debug.getNode(node.id)?.parentNodeId === nodeId)?.id ?? null;
    }, id);
    expect(childId).toBeTruthy();
    await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), childId!);
    await expect.poll(() => desktopWindow.evaluate(() =>
      window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
    )).toBe(paragraph);
  }
  await desktopWindow.screenshot({ path: '.tmp/artifacts/devanagari-extract-selection.png' });
});

test('dragging from a Devanagari conjunct selects its complete opening', async ({ desktopWindow }) => {
  const samples = [
    'ब्राह्मण ने पुस्तक पढ़ी।',
    'क्षत्रिय वंश से था।',
    'ज्ञान की प्राप्ति हुई।',
    'त्रिवेदी जी आए।'
  ];
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (contents) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.(
      contents.map((content, index) => ({
        content, id: `devanagari-conjunct-${index}`, kind: 'topic' as const,
        title: `devanagari-conjunct-${index}`
      })),
      { persist: true }
    );
  }, samples);
  for (const [index, content] of samples.entries()) {
    const id = `devanagari-conjunct-${index}`;
    await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), id);
    await expect.poll(() => desktopWindow.evaluate(() =>
      window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
    )).toBe(content);

    await dragParagraph(desktopWindow, 0.2);
    expect(await desktopWindow.evaluate(() =>
      window.__folioleDebug?.getEditorSelection?.('prompt-editor') ?? null
    )).toEqual({ from: 0, to: content.length });

    const toolbar = desktopWindow.locator('[data-annotation-toolbar="true"]');
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole('button', { name: 'Highlight' }).click();
    await expect.poll(() => desktopWindow.evaluate((nodeId) => {
      const debug = window.__folioleWorkspaceDebug;
      return debug?.listNodes().map((node) => debug.getNode(node.id)).filter((node) =>
        node?.parentNodeId === nodeId && node.anchorLink?.kind === 'highlight'
      ).map((node) => ({ content: node!.content, locator: node!.anchorLink?.locator })) ?? [];
    }, id)).toEqual([{
      content,
      locator: expect.objectContaining({ from: 0, originalText: content })
    }]);
  }
});
