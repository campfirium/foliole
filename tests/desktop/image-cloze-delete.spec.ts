import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const DEBUG_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2d8AAAAASUVORK5CYII=';

async function seedImageTopic(desktopWindow: Page) {
  const seeded = await desktopWindow.evaluate(async ({ debugPngBase64 }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: '',
        id: 'topic-image-cloze',
        kind: 'topic',
        title: 'Playwright Image Cloze Topic'
      }
    ]);
    const attachmentId = await api?.importClipboardImageAttachment?.({
      bytesBase64: debugPngBase64,
      mimeType: 'image/png',
      nodeId: 'topic-image-cloze',
      originalName: 'playwright-image.png'
    });
    if (!attachmentId) {
      return false;
    }
    await api?.seedNodes?.([
      {
        content: `![Cover](asset://${attachmentId}.png)`,
        id: 'topic-image-cloze',
        kind: 'topic',
        title: 'Playwright Image Cloze Topic'
      }
    ]);
    return true;
  }, { debugPngBase64: DEBUG_PNG_BASE64 });
  expect(seeded).toBe(true);
}

async function openSeededTopic(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const targetNode = api?.listNodes?.().find((node) => node.id === 'topic-image-cloze') ?? null;
    if (!targetNode) {
      return false;
    }
    return api?.openNode?.(targetNode.id) ?? false;
  });
}

async function waitForImageSurface(desktopWindow: Page) {
  const image = desktopWindow.locator('.cm-md-image-element-block').first();
  await expect(image).toBeVisible();
  await desktopWindow.waitForFunction(() => {
    const target = document.querySelector('.cm-md-image-element-block') as HTMLImageElement | null;
    return Boolean(target && target.complete && target.naturalWidth > 0);
  });
  return desktopWindow.locator('.cm-md-image-surface-block').first();
}

async function dragCreateRegion(desktopWindow: Page) {
  const surface = await waitForImageSurface(desktopWindow);
  const box = await surface.boundingBox();
  if (!box) {
    throw new Error('missing image surface box');
  }
  await desktopWindow.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.22);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.42, { steps: 8 });
  await desktopWindow.mouse.up();
  await desktopWindow.getByRole('button', { name: 'Confirm image cloze' }).click();
}

async function clickRegionBorder(desktopWindow: Page) {
  const region = desktopWindow.locator('.cm-md-image-cloze-region').first();
  await expect(region).toBeVisible();
  const box = await region.boundingBox();
  if (!box) {
    throw new Error('missing image cloze region box');
  }
  await desktopWindow.mouse.move(box.x + 4, box.y + box.height / 2);
  await desktopWindow.mouse.click(box.x + 4, box.y + box.height / 2);
}

async function collectSelectionDebugState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const region = document.querySelector('.cm-md-image-cloze-region') as HTMLElement | null;
    const overlay = document.querySelector('.cm-md-image-cloze-overlay') as HTMLElement | null;
    const deleteControl = document.querySelector('.cm-md-image-cloze-delete') as HTMLElement | null;
    const wrapper = document.querySelector('.cm-md-image-surface-block') as HTMLElement | null;
    return {
      deleteControlHidden: deleteControl?.hidden ?? null,
      deleteControlStyle: deleteControl ? { left: deleteControl.style.left, top: deleteControl.style.top } : null,
      overlayHidden: overlay?.hidden ?? null,
      overlayHover: overlay?.dataset.mdImageRegionHover ?? null,
      regionState: region?.dataset.regionState ?? null,
      wrapperClasses: wrapper?.className ?? null
    };
  });
}

test('creates and deletes an image cloze region without leaving it on the image', async ({ desktopWindow }) => {
  await seedImageTopic(desktopWindow);
  await openSeededTopic(desktopWindow);
  await dragCreateRegion(desktopWindow);

  const regions = desktopWindow.locator('.cm-md-image-cloze-region');
  await expect(regions).toHaveCount(1);

  await clickRegionBorder(desktopWindow);
  console.log(JSON.stringify(await collectSelectionDebugState(desktopWindow), null, 2));
  await expect(desktopWindow.getByRole('button', { name: 'Delete image cloze' })).toBeVisible();
  await desktopWindow.getByRole('button', { name: 'Delete image cloze' }).click();

  await expect(regions).toHaveCount(0);
});
