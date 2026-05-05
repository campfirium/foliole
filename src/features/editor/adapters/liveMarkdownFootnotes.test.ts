import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn(() => null),
  openExternalUrl: vi.fn()
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

describe('live markdown footnote rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders imported footnote markers as superscript widgets with hover text', () => {
    const { adapter, host } = createAdapterHost('Weight^[1]{1 pound is about 0.454 kilograms.} matters.');

    const widget = host.querySelector<HTMLElement>('.cm-md-footnote-widget');
    const marker = host.querySelector<HTMLElement>('.cm-md-footnote-marker');
    expect(widget).not.toBeNull();
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toBe('1');
    expect(host.textContent).not.toContain('^[1]{1 pound is about 0.454 kilograms.}');

    marker?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const tooltip = host.querySelector<HTMLElement>('.cm-md-footnote-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.textContent).toContain('1 pound is about 0.454 kilograms.');
    expect(getComputedStyle(widget as HTMLElement).verticalAlign).toBe('super');

    adapter.destroy();
  });

  it('keeps unmatched imported footnote markers visible instead of flattening them into body text', () => {
    const { adapter, host } = createAdapterHost('Weight^[2] still needs a note.');

    const widget = host.querySelector<HTMLElement>('.cm-md-footnote-widget[data-md-footnote-status="unresolved"]');
    expect(widget).not.toBeNull();
    expect(widget?.querySelector('.cm-md-footnote-marker')?.textContent).toBe('2');
    expect(host.querySelector('.cm-md-footnote-tooltip')).toBeNull();

    adapter.destroy();
  });
});

