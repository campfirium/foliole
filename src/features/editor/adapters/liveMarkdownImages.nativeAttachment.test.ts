import { waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({
  invalidate: vi.fn(),
  resolve: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'ios'),
    isNativePlatform: vi.fn(() => true)
  },
  registerPlugin: vi.fn(() => ({}))
}));

vi.mock('../../../shared/platform/attachmentResources', () => ({
  invalidateAttachmentResourceResolution: attachmentMock.invalidate,
  resolveRuntimeAttachmentResource: attachmentMock.resolve
}));

import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from './liveMarkdownImages';

afterEach(() => {
  for (const widget of document.querySelectorAll<HTMLElement>('.cm-md-image-widget')) disposeMarkdownImageWidgetDom(widget);
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

it('resolves iOS attachment images through the shared native resource capability', async () => {
  const hash = 'a'.repeat(64);
  const source = `asset://${hash}.png`;
  attachmentMock.resolve.mockResolvedValue({
    mime_type: 'image/png',
    resource_url: 'capacitor://localhost/_capacitor_file_/attachments/hash-ios',
    status: 'ready'
  });

  const widget = createMarkdownImageWidgetDom({
    alt: 'iOS attachment',
    attachmentId: hash,
    display: 'block',
    from: 0,
    source,
    to: 31
  });
  document.body.append(widget);

  await waitFor(() => {
    expect(widget.querySelector('.cm-md-image-element')).toHaveAttribute(
      'src',
      'capacitor://localhost/_capacitor_file_/attachments/hash-ios'
    );
  });
  expect(attachmentMock.resolve).toHaveBeenCalledWith(source, { refresh: true });
});

it('ignores an attachment resolution that arrives after the widget is disposed', async () => {
  const hash = 'b'.repeat(64);
  const source = `asset://${hash}.png`;
  let finishResolution: (value: unknown) => void = () => undefined;
  attachmentMock.resolve.mockReturnValue(new Promise((resolve) => {
    finishResolution = resolve;
  }));
  const requestMeasure = vi.fn();
  const widget = createMarkdownImageWidgetDom({
    alt: 'Disposed attachment', attachmentId: hash, display: 'block', from: 0, source, to: 38
  }, null, null, requestMeasure);

  disposeMarkdownImageWidgetDom(widget);
  finishResolution({
    mime_type: 'image/png', resource_url: 'foliole-asset://attachment/disposed', status: 'ready'
  });
  await Promise.resolve();
  await Promise.resolve();

  expect(widget.querySelector('.cm-md-image-element')).toBeNull();
  expect(requestMeasure).not.toHaveBeenCalled();
});

it('refreshes only the restored resource and unsubscribes when the widget is disposed', async () => {
  const { notifyAttachmentResourceAvailable } = await import('../../../shared/platform/runtime/attachmentResourceAvailability');
  const hash = 'c'.repeat(64);
  const key = `${hash}.png`;
  attachmentMock.resolve.mockResolvedValue({ status: 'missing_file' });
  const widget = createMarkdownImageWidgetDom({ alt: 'recovering', attachmentId: hash,
    display: 'block', from: 0, source: `asset://${key}`, to: 90 });
  document.body.append(widget);
  await waitFor(() => expect(widget.querySelector('[data-md-image-status="unavailable"]')).not.toBeNull());
  attachmentMock.resolve.mockClear();
  notifyAttachmentResourceAvailable(`${'d'.repeat(64)}.png`);
  await Promise.resolve();
  expect(attachmentMock.resolve).not.toHaveBeenCalled();
  disposeMarkdownImageWidgetDom(widget);
  notifyAttachmentResourceAvailable(key);
  await Promise.resolve();
  expect(attachmentMock.resolve).not.toHaveBeenCalled();
});

it('rechecks after an in-flight missing result when resource bytes arrive during resolution', async () => {
  const { notifyAttachmentResourceAvailable } = await import('../../../shared/platform/runtime/attachmentResourceAvailability');
  const hash = 'e'.repeat(64);
  const key = `${hash}.png`;
  let finish: (value: unknown) => void = () => undefined;
  attachmentMock.resolve.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({ status: 'ready', resource_url: 'file:///restored.png', mime_type: 'image/png' });
  const widget = createMarkdownImageWidgetDom({ alt: 'recovering', attachmentId: hash,
    display: 'block', from: 0, source: `asset://${key}`, to: 90 });
  document.body.append(widget);
  notifyAttachmentResourceAvailable(key);
  finish({ status: 'missing_file' });
  await waitFor(() => expect(widget.querySelector('.cm-md-image-element')).toHaveAttribute('src', 'file:///restored.png'));
  disposeMarkdownImageWidgetDom(widget);
});
