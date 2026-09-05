import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn(() => null) }));
vi.mock('../../../shared/platform/bridge', () => ({ openExternalUrl: vi.fn() }));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function pointer(type: string, clientX: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    isPrimary: { value: true },
    pointerId: { value: pointerId }
  });
  return event;
}

function mockRect(element: HTMLElement, width: () => number) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ bottom: 200, height: 120, left: 0, right: width(), toJSON: () => ({}), top: 0, width: width(), x: 0, y: 0 })
  });
}

describe('live markdown image resize', () => {
  beforeEach(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an Obsidian width suffix without exposing it as alt text', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '![Cover|268](asset://hash-1.png)' });
    const surface = host.querySelector('.cm-md-image-surface-block') as HTMLElement;

    expect(surface.style.width).toBe('268px');
    expect(host.querySelector('.cm-md-image-element')).toHaveAttribute('alt', 'Cover');
    const handle = host.querySelector('.cm-md-image-resize-handle');
    expect(handle).toHaveAttribute('aria-label', 'Resize image');
    expect(handle).toHaveClass('border-0', 'bg-transparent', 'shadow-none');
    expect(handle?.querySelector('[aria-hidden="true"]')).toHaveClass('border-b-2', 'border-r-2');

    adapter.destroy();
  });

  it('writes the dragged width into markdown and resets it on double click', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: '![Cover|268](asset://hash-1.png)' });
    const widget = host.querySelector('.cm-md-image-widget') as HTMLElement;
    const surface = host.querySelector('.cm-md-image-surface-block') as HTMLElement;
    const handle = host.querySelector('.cm-md-image-resize-handle') as HTMLButtonElement;
    Object.assign(handle, { hasPointerCapture: () => true, releasePointerCapture: vi.fn(), setPointerCapture: vi.fn() });
    mockRect(widget, () => 600);
    mockRect(surface, () => Number.parseInt(surface.style.width, 10) || 268);

    handle.dispatchEvent(pointer('pointerdown', 100));
    handle.dispatchEvent(pointer('pointermove', 150));
    handle.dispatchEvent(pointer('pointerup', 150));

    expect(adapter.getContent()).toBe('![Cover|318](asset://hash-1.png)');
    (host.querySelector('.cm-md-image-resize-handle') as HTMLButtonElement).dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true })
    );
    expect(adapter.getContent()).toBe('![Cover](asset://hash-1.png)');

    adapter.destroy();
  });
});
