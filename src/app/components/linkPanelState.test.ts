import { describe, expect, it, vi } from 'vitest';

import { appendLinkPanel, closeLinkPanel, patchLinkPanel, replaceLinkPanelUrl } from './linkPanelState';

function createPanels() {
  return [
    {
      canGoBack: false,
      canGoForward: false,
      currentUrl: 'https://example.com/docs',
      id: 'panel-1',
      title: 'Docs'
    },
    {
      canGoBack: false,
      canGoForward: false,
      currentUrl: 'https://openai.com',
      id: 'panel-2',
      title: 'OpenAI'
    }
  ];
}

describe('linkPanelState creation', () => {
  it('adds a new panel for each document link open request', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-1111-1111-111111111111')
      .mockReturnValueOnce('22222222-2222-2222-2222-222222222222');

    const first = appendLinkPanel([], { href: 'https://example.com/docs' });
    const second = appendLinkPanel(first, { href: 'https://openai.com/research' });

    expect(second.map((panel) => panel.currentUrl)).toEqual([
      'https://example.com/docs',
      'https://openai.com/research'
    ]);
  });

  it('replaces only the current panel url when navigation continues inside a panel', () => {
    const panels = createPanels().map((panel) => ({ ...panel, title: panel.currentUrl.includes('example') ? 'example.com' : 'openai.com' }));

    expect(replaceLinkPanelUrl(panels, 'panel-2', 'https://openai.com/api')).toEqual([
      panels[0],
      {
        canGoBack: false,
        canGoForward: false,
        currentUrl: 'https://openai.com/api',
        id: 'panel-2',
        title: 'openai.com'
      }
    ]);
  });
});

describe('linkPanelState updates', () => {
  it('updates navigation status without touching sibling panels', () => {
    const panels = createPanels();

    expect(
      patchLinkPanel(panels, 'panel-1', { canGoBack: true, currentUrl: 'https://example.com/docs/next', title: 'Next' })
    ).toEqual([
      {
        canGoBack: true,
        canGoForward: false,
        currentUrl: 'https://example.com/docs/next',
        id: 'panel-1',
        title: 'Next'
      },
      panels[1]
    ]);
  });

  it('closes only the targeted panel', () => {
    const panels = createPanels();

    expect(closeLinkPanel(panels, 'panel-1')).toEqual([panels[1]]);
  });
});
