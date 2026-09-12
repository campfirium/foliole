import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

const sourceContext = vi.hoisted(() => ({
  forget: vi.fn(async () => true),
  load: vi.fn(),
  save: vi.fn(async () => true)
}));

vi.mock('../../../shared/platform/remoteImageSourceRecovery', () => ({
  forgetRemoteImageLearnedSource: sourceContext.forget,
  loadRemoteImageSourceContext: sourceContext.load,
  saveRemoteImageSourceWebsite: sourceContext.save
}));

import { createMarkdownImageWidgetDom } from './liveMarkdownImages';

function createWidget() {
  const widget = createMarkdownImageWidgetDom({
    alt: 'Remote', attachmentId: null, display: 'block', from: 0,
    source: 'https://cdn.example/missing.png', to: 49
  }, 'node-1');
  document.body.append(widget);
  return widget;
}

async function imageSource(host: HTMLElement) {
  await waitFor(() => expect(host.querySelector<HTMLImageElement>('.cm-md-image-element')?.src).toBeTruthy());
  return host.querySelector<HTMLImageElement>('.cm-md-image-element')!.src;
}

beforeEach(() => {
  sourceContext.load.mockReset().mockResolvedValue({
    imageHost: 'cdn.example',
    learnedSourceOrigin: 'https://source.example/',
    source: 'learned',
    sourceOrigin: 'https://source.example/'
  });
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'false');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
});

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

it('reuses one render provenance across failure and retry', async () => {
  const widget = createWidget();
  const initial = new URL(await imageSource(widget));
  expect(initial.searchParams.get('origin')).toBe('https://source.example/');
  expect(initial.searchParams.get('provenance')).toBe('learned');

  widget.querySelector<HTMLImageElement>('.cm-md-image-element')?.dispatchEvent(new Event('error'));
  await waitFor(() => expect(widget.querySelector('button[aria-label="Retry"]')).not.toBeNull());
  fireEvent.contextMenu(widget.querySelector('.cm-md-image-status')!, { clientX: 10, clientY: 10 });
  expect(document.body.querySelector('[role="menu"]')?.textContent)
    .toContain('Forget learned source for this site');
  widget.querySelector<HTMLButtonElement>('button[aria-label="Retry"]')?.click();

  let retriedSource = '';
  await waitFor(() => {
    retriedSource = widget.querySelector<HTMLImageElement>('.cm-md-image-element')?.src ?? '';
    expect(new URL(retriedSource).searchParams.get('retry')).toBeTruthy();
  });
  const retried = new URL(retriedSource);
  expect(retried.searchParams.get('retry')).toBeTruthy();
  expect(retried.searchParams.get('provenance')).toBe('learned');
  expect(sourceContext.load).toHaveBeenCalledTimes(1);

  widget.querySelector<HTMLImageElement>('.cm-md-image-element')?.dispatchEvent(new Event('error'));
  await waitFor(() => expect(widget.querySelector('.cm-md-image-status')).not.toBeNull());
  fireEvent.contextMenu(widget.querySelector('.cm-md-image-status')!, { clientX: 10, clientY: 10 });
  const forget = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find((item) => item.textContent?.includes('Forget learned source'));
  forget?.click();
  await waitFor(() => expect(sourceContext.load).toHaveBeenCalledTimes(2));
});

it('falls back to a direct request when context loading fails', async () => {
  sourceContext.load.mockRejectedValueOnce(new Error('query failed'));
  const widget = createWidget();
  const url = new URL(await imageSource(widget));

  expect(url.searchParams.get('origin')).toBeNull();
  expect(url.searchParams.get('provenance')).toBeNull();
  expect(sourceContext.load).toHaveBeenCalledTimes(1);
});
