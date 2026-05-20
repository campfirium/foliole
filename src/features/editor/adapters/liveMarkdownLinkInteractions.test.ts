import { afterEach, describe, expect, it, vi } from 'vitest';

import { setMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createHost() {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
  setMarkdownSyntaxVisibility('hidden');
});

describe('liveMarkdown browser link gestures', () => {
  it('marks Ctrl-clicked links for browser opening', () => {
    const host = createHost();
    const onOpenExternalLink = vi.fn();
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'Read https://example.com now.',
      onOpenExternalLink
    });
    const link = host.querySelector('[data-md-link-url="https://example.com"]');

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 320, clientY: 240, ctrlKey: true }));

    expect(onOpenExternalLink).toHaveBeenCalledWith({
      anchorPoint: { x: 320, y: 240 },
      href: 'https://example.com',
      target: 'browser'
    });
    adapter.destroy();
  });

  it('marks middle-clicked links for browser opening', () => {
    const host = createHost();
    const onOpenExternalLink = vi.fn();
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'Read https://example.com now.',
      onOpenExternalLink
    });
    const link = host.querySelector('[data-md-link-url="https://example.com"]');

    link?.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1, clientX: 320, clientY: 240 }));

    expect(onOpenExternalLink).toHaveBeenCalledWith({
      anchorPoint: { x: 320, y: 240 },
      href: 'https://example.com',
      target: 'browser'
    });
    adapter.destroy();
  });
});
