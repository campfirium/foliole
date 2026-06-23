import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { expect, it, vi } from 'vitest';

import type { LinkPanelRecord } from './linkPanelState';

const mocks = vi.hoisted(() => ({
  linkPanelStack: vi.fn((props: { panels: LinkPanelRecord[] }) => (
    <div data-testid="lazy-link-panel-stack">{props.panels.length}</div>
  ))
}));

vi.mock('./LinkPanelStack', () => ({
  LinkPanelStack: mocks.linkPanelStack
}));

const { LazyLinkPanelStack } = await import('./LazyLinkPanelStack');

function createPanel(): LinkPanelRecord {
  return {
    canGoBack: false,
    canGoForward: false,
    currentUrl: 'https://example.com/docs',
    id: 'panel-1',
    title: 'example.com'
  };
}

function renderStack(panels: LinkPanelRecord[]) {
  return render(
    <LazyLinkPanelStack
      anchorRootRef={createRef<HTMLDivElement>()}
      onClose={vi.fn()}
      onStateChange={vi.fn()}
      panels={panels}
    />
  );
}

it('does not render or load the real stack when there are no panels', () => {
  renderStack([]);

  expect(screen.queryByTestId('lazy-link-panel-stack')).not.toBeInTheDocument();
  expect(mocks.linkPanelStack).not.toHaveBeenCalled();
});

it('renders the real stack on demand when panels exist', async () => {
  const panel = createPanel();
  renderStack([panel]);

  expect(await screen.findByTestId('lazy-link-panel-stack')).toHaveTextContent('1');
  expect(mocks.linkPanelStack).toHaveBeenCalled();
  expect(mocks.linkPanelStack.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ panels: [panel] }));
});
