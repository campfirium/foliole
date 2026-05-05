import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

function pickRectInBrowser(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width
  };
}

function collectEditorMetricsInBrowser(host: Element) {
  const content = host.querySelector('.cm-content') as HTMLElement | null;
  const scroller = host.querySelector('.cm-scroller') as HTMLElement | null;
  const contentStyle = content ? getComputedStyle(content) : null;
  return {
    content: pickRectInBrowser(content),
    contentChildren: Array.from(content?.children ?? []).map((child) => ({
      className: (child as HTMLElement).className,
      rect: pickRectInBrowser(child),
      text: (child.textContent ?? '').trim().slice(0, 60)
    })),
    contentPadding: contentStyle
      ? {
          paddingBottom: contentStyle.paddingBottom,
          paddingTop: contentStyle.paddingTop
        }
      : null,
    host: pickRectInBrowser(host),
    imageMaxHeightVar: getComputedStyle((host as HTMLElement).parentElement ?? (host as HTMLElement)).getPropertyValue('--editor-image-max-height').trim(),
    scroller: pickRectInBrowser(scroller),
    scrollMetrics: scroller ? { clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight, scrollTop: scroller.scrollTop } : null
  };
}

function collectImageMetricsInBrowser(image: HTMLImageElement) {
  return {
    computedMaxHeight: getComputedStyle(image).maxHeight,
    computedMaxWidth: getComputedStyle(image).maxWidth,
    naturalHeight: image.naturalHeight,
    naturalWidth: image.naturalWidth,
    rect: pickRectInBrowser(image),
    surface: pickRectInBrowser(image.closest('.cm-md-image-surface-block')),
    widget: pickRectInBrowser(image.closest('.cm-md-image-widget-block'))
  };
}

async function openTargetNodeInBrowser(title: string) {
  const api = globalThis.window?.__folioleWorkspaceDebug;
  const targetNode = api?.listNodes?.().find((node) => String(node.title ?? '').includes(title)) ?? null;
  const opened = targetNode ? await (api?.openNode?.(targetNode.id) ?? Promise.resolve(false)) : false;
  await new Promise((resolve) => globalThis.setTimeout(resolve, 1500));
  return { opened, targetNodeId: targetNode?.id ?? null };
}

async function collectImageClozeLayoutMetrics(desktopWindow: Page, targetTitle: string) {
  return desktopWindow.evaluate(async (title) => {
    const { opened, targetNodeId } = await openTargetNodeInBrowser(title);
    const editorHosts = Array.from(document.querySelectorAll('.markdown-editor-host'));
    const imageElements = Array.from(document.querySelectorAll('.cm-md-image-element-block'));
    const documentArea = document.querySelector('[aria-label="Document area"]') as HTMLElement | null;
    const documentStack = document.querySelector('.document-panel-editor-stack') as HTMLElement | null;

    return {
      bodyWidth: document.body.getBoundingClientRect().width,
      documentArea: pickRectInBrowser(documentArea),
      documentAreaScroll: documentArea
        ? { clientHeight: documentArea.clientHeight, scrollHeight: documentArea.scrollHeight, scrollTop: documentArea.scrollTop }
        : null,
      documentStack: pickRectInBrowser(documentStack),
      lineWidth: pickRectInBrowser(document.querySelector('[aria-hidden="true"].bg-border')),
      opened,
      targetNodeId,
      editors: editorHosts.map((host) => collectEditorMetricsInBrowser(host)),
      images: imageElements.map((image) => collectImageMetricsInBrowser(image)),
      windowWidth: globalThis.innerWidth
    };
  }, targetTitle);
}

test('inspect image cloze layout metrics', async ({ desktopWindow }, testInfo) => {
  const metrics = await collectImageClozeLayoutMetrics(desktopWindow, '资源之家（风景壁纸）');

  await testInfo.attach('image-cloze-layout-metrics', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
  console.log(JSON.stringify(metrics, null, 2));
  expect(metrics.opened).toBe(true);
  expect(metrics.images.length).toBeGreaterThanOrEqual(2);
});

test('keeps image cloze editors scrollbar-free with two text lines above the prompt image', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    api?.seedNodes?.([
      {
        content: '123\n234\n\n![Cover](https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2560&q=80)',
        id: 'seed-item-1',
        kind: 'item',
        reveal: '![Cover](https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2560&q=80)',
        title: 'Seed Image Cloze Item'
      }
    ]);
  });

  const metrics = await collectImageClozeLayoutMetrics(desktopWindow, 'Seed Image Cloze Item');

  await testInfo.attach('image-cloze-layout-multiline-metrics', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
  console.log(JSON.stringify(metrics, null, 2));
  expect(metrics.opened).toBe(true);
  expect(metrics.editors.every((editor) => editor.scrollMetrics?.scrollHeight === editor.scrollMetrics?.clientHeight)).toBe(true);
});
