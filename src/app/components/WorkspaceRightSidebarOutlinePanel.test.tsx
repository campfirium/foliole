import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { WorkspaceRightSidebarOutlinePanel } from './WorkspaceRightSidebarOutlinePanel';

function renderOutline(content: string) {
  return render(
    <WorkspaceRightSidebarOutlinePanel
      activePosition={content.length}
      content={content}
      onRevealPosition={vi.fn()}
    />
  );
}

it('keeps all outline entries at normal font weight', () => {
  renderOutline('# Title\n\n## First section\n\n### Detail');

  const outlineNav = screen.getByRole('navigation', { name: 'Document outline' });

  expect(screen.getByRole('button', { name: 'First section' })).toHaveClass('font-normal');
  expect(screen.getByRole('button', { name: 'Detail' })).toHaveClass('font-normal');
  expect(outlineNav.querySelector('[class*="font-semibold"]')).toBeNull();
  expect(outlineNav.querySelector('[class*="font-medium"]')).toBeNull();
});

it('hides guide markers when the outline has only one visible level', () => {
  renderOutline('# Title\n\n## First section\n\n## Second section');

  const outlineNav = screen.getByRole('navigation', { name: 'Document outline' });

  expect(outlineNav.querySelector('[class*="border-dashed"]')).toBeNull();
  expect(outlineNav.querySelector('[class*="rounded-full"]')).toBeNull();
});

it('shows guide markers when the outline has nested visible levels', () => {
  const { container } = renderOutline('# Title\n\n## First section\n\n### Detail');

  expect(container.querySelector('[class*="border-dashed"]')).not.toBeNull();
  expect(container.querySelector('[class*="rounded-full"]')).not.toBeNull();
});
