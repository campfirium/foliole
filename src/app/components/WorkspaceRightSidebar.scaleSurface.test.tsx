import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DisplayScaleProvider } from '../../features/settings/context/DisplayScaleProvider';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

vi.mock('./WorkspaceRightSidebarPanels', () => ({
  renderWorkspaceRightSidebarPanel: (props: { activePanelId: string }) => (
    <section data-testid={`feature-${props.activePanelId}`}>
      <header data-testid="feature-header">Feature header</header>
      <main data-testid="feature-body">Feature body</main>
    </section>
  )
}));

function SidebarHarness({ activePanelId }: { activePanelId: 'assistant' | 'outline' }) {
  return (
    <LocalizationProvider>
      <DisplayScaleProvider>
        <WorkspaceRightSidebar
          activeNodeId={null}
          activePanelId={activePanelId}
          nodeOrder={[]}
          nodesById={{}}
          onRevealAnchorInDocument={vi.fn()}
          onSelectBreadcrumbNode={vi.fn()}
          onSelectNode={vi.fn()}
          reviewCurrentNodeId={null}
          reviewQueueNodeIds={[]}
          reviewSchedulerSettings={{} as never}
          trashedNodeIds={[]}
        />
      </DisplayScaleProvider>
    </LocalizationProvider>
  );
}

it('keeps the sidebar slot outside the active feature scale surface', () => {
  const { container, rerender } = render(<SidebarHarness activePanelId="assistant" />);
  const slot = container.querySelector('.workspace-region-main-sidebar');
  const assistantSurface = container.querySelector('[data-panel-scale-id="right-panel:assistant"]');

  expect(slot).not.toHaveAttribute('data-panel-scale-id');
  expect(assistantSurface).not.toBe(slot);
  expect(assistantSurface?.parentElement).toHaveClass('flex', 'min-h-0', 'overflow-hidden');
  expect(assistantSurface).toHaveClass('flex-1', 'min-h-0', 'overflow-hidden');
  expect(assistantSurface).toContainElement(screen.getByTestId('feature-header'));
  expect(assistantSurface).toContainElement(screen.getByTestId('feature-body'));
  expect(container.querySelectorAll('[data-panel-scale-surface]')).toHaveLength(1);

  rerender(<SidebarHarness activePanelId="outline" />);
  const outlineSurface = container.querySelector('[data-panel-scale-id="right-panel:outline"]');
  expect(outlineSurface).toContainElement(screen.getByTestId('feature-outline'));
  expect(container.querySelectorAll('[data-panel-scale-surface]')).toHaveLength(1);
});
