// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { mountCompanionPreviewShell } from '../../scripts/vite/companionPreviewShell';

let preview: ReturnType<typeof mountCompanionPreviewShell>;
afterEach(() => {
  preview?.dispose();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function openPreview() {
  preview = mountCompanionPreviewShell(document, 1000);
  const source = preview.frame.contentWindow!;
  source.document.open();
  source.document.write('<main><h1>Reading</h1><button onclick="window.changed=true">Grade</button></main>');
  source.document.close();
  vi.spyOn(preview.frozen.contentWindow!, 'scrollTo').mockImplementation(() => undefined);
  preview.shell.ready(source);
  return source;
}

it('retains a script-free, inert picture while one live page reloads, then reveals the ready page', async () => {
  const source = openPreview();
  await preview.shell.beforeReload(source);
  expect(preview.frozen.hidden).toBe(false);
  expect(preview.frozen.inert).toBe(true);
  expect(preview.frame.inert).toBe(true);
  expect(preview.overlay.textContent).toContain('Updating');
  expect(preview.frozen.contentDocument?.querySelector('h1')?.textContent).toBe('Reading');
  expect(preview.frozen.contentDocument?.querySelector('button')?.hasAttribute('onclick')).toBe(false);
  source.document.body.textContent = 'Starting';
  expect(preview.frozen.contentDocument?.body.textContent).toContain('Reading');
  expect(preview.frame.style.visibility).toBe('hidden');
  preview.shell.ready(source);
  expect(preview.frozen.hidden).toBe(false);
  preview.frame.src = 'about:blank';
  const replacement = preview.frame.contentWindow!;
  replacement.document.body.textContent = 'Restored reading';
  preview.shell.ready(replacement);
  expect(preview.frame.inert).toBe(false);
  expect(preview.frozen.hidden).toBe(true);
  expect(preview.overlay.hidden).toBe(true);
});

it('keeps a failed update blocked and rejects automatic reloads until a manual retry', async () => {
  const source = openPreview();
  await preview.shell.beforeReload(source);
  preview.shell.failed(source, 'Compilation failed');
  preview.shell.ready(source);
  expect(preview.overlay.textContent).toContain('Compilation failed');
  expect(preview.retry.hidden).toBe(false);
  expect(preview.frame.inert).toBe(true);
  await expect(preview.shell.beforeReload(source)).rejects.toThrow('manual retry');
  expect(preview.frozen.hidden).toBe(false);
});

it('keeps a decorative system status bar above the content during updates and failures', async () => {
  const source = openPreview();
  const statusBar = () => preview.viewport.querySelector('.preview-status-bar');
  expect(statusBar()?.textContent).toContain('9:41');
  expect(statusBar()?.getAttribute('aria-hidden')).toBe('true');
  await preview.shell.beforeReload(source);
  expect(statusBar()?.textContent).toContain('9:41');
  preview.shell.failed(source, 'Compilation failed');
  expect(statusBar()?.textContent).toContain('9:41');
  expect(preview.retry.hidden).toBe(false);
});

it('reports startup timeout and preserves the last good picture across consecutive updates', async () => {
  vi.useFakeTimers();
  const source = openPreview();
  await preview.shell.beforeReload(source);
  source.document.body.textContent = 'Starting';
  await preview.shell.beforeReload(source);
  expect(preview.frozen.contentDocument?.body.textContent).toContain('Reading');
  vi.advanceTimersByTime(1001);
  expect(preview.overlay.textContent).toContain('did not become ready');
  expect(preview.frame.inert).toBe(true);
});

it('waits for the original destination, topic and reading position before switching', async () => {
  const source = openPreview();
  source.document.body.innerHTML = '<span data-companion-preview-destination="recent"></span>'
    + '<main data-testid="companion-scroll-container"><article data-companion-article-document="true" data-node-id="topic" /></main>';
  source.document.querySelector('main')!.scrollTop = 120;
  await preview.shell.beforeReload(source);
  preview.frame.src = 'about:blank';
  const replacement = preview.frame.contentWindow!;
  replacement.document.body.innerHTML = '<span data-companion-preview-destination="review"></span><main data-testid="companion-scroll-container" />';
  preview.shell.ready(replacement);
  expect(preview.frozen.hidden).toBe(false);
  replacement.document.querySelector('span')!.setAttribute('data-companion-preview-destination', 'recent');
  replacement.document.querySelector('main')!.innerHTML = '<article data-companion-article-document="true" data-node-id="topic" />';
  preview.shell.ready(replacement);
  expect(preview.frozen.hidden).toBe(false);
  replacement.document.querySelector('main')!.scrollTop = 120;
  preview.shell.ready(replacement);
  expect(preview.frozen.hidden).toBe(true);
});

it('retries the old document shutdown only after a user click and keeps failures visible', async () => {
  const source = openPreview();
  await preview.shell.beforeReload(source);
  preview.shell.failed(source, 'Save failed');
  source.__foliolePreviewClose = vi.fn().mockRejectedValue(new Error('Save still failed'));
  expect(source.__foliolePreviewClose).not.toHaveBeenCalled();
  preview.retry.click();
  await vi.waitFor(() => expect(preview.overlay.textContent).toContain('Save still failed'));
  expect(source.__foliolePreviewClose).toHaveBeenCalledTimes(1);
  expect(preview.frozen.hidden).toBe(false);
});

it('retains canvas pixels as an image in the script-disabled frozen document', async () => {
  const source = openPreview();
  const canvas = source.document.createElement('canvas');
  canvas.style.width = '240px';
  canvas.style.height = '120px';
  const bitmap = 'data:image/png;base64,snapshot';
  vi.spyOn(canvas, 'toDataURL').mockReturnValue(bitmap);
  source.document.body.append(canvas);
  await preview.shell.beforeReload(source);
  const image = preview.frozen.contentDocument!.querySelector('img');
  expect(image?.src).toBe(bitmap);
  expect(image?.style.height).toBe('120px');
  expect(preview.frozen.contentDocument!.querySelector('canvas')).toBeNull();
});

it('keeps standards layout when copying a complete page into the frozen document', async () => {
  const source = openPreview();
  source.document.open();
  source.document.write('<!doctype html><html><head></head><body><h1>Reading</h1></body></html>');
  source.document.close();
  await preview.shell.beforeReload(source);
  expect(preview.frozen.contentDocument?.compatMode).toBe('CSS1Compat');
});

it('keeps the old document when its picture cannot be captured, including a manual retry', async () => {
  const source = openPreview();
  const canvas = source.document.createElement('canvas');
  vi.spyOn(canvas, 'toDataURL').mockImplementation(() => { throw new Error('Canvas capture failed'); });
  source.document.body.append(canvas);
  source.__foliolePreviewClose = vi.fn();
  await expect(preview.shell.beforeReload(source)).rejects.toThrow('Canvas capture failed');
  preview.retry.click();
  await vi.waitFor(() => expect(preview.overlay.textContent).toContain('Canvas capture failed'));
  expect(source.__foliolePreviewClose).not.toHaveBeenCalled();
  expect(source.document.body.textContent).toContain('Reading');
});

it('waits for a viewport to exist even when its saved position is zero', async () => {
  const source = openPreview();
  source.document.querySelector('main')!.setAttribute('data-testid', 'companion-scroll-container');
  await preview.shell.beforeReload(source);
  preview.frame.src = 'about:blank';
  const replacement = preview.frame.contentWindow!;
  preview.shell.ready(replacement);
  expect(preview.frozen.hidden).toBe(false);
  replacement.document.body.innerHTML = '<main data-testid="companion-scroll-container"></main>';
  preview.shell.ready(replacement);
  expect(preview.frozen.hidden).toBe(true);
});
