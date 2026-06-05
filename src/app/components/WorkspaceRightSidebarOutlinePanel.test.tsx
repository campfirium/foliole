import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import {
  resolveOutlineActiveScrollTop,
  WorkspaceRightSidebarOutlinePanel
} from './WorkspaceRightSidebarOutlinePanel';

function renderOutline(content: string) {
  return renderWithLocalization(
    <WorkspaceRightSidebarOutlinePanel
      activePosition={content.length}
      content={content}
      onRevealPosition={vi.fn()}
    />
  );
}

it('renders an empty state when the current topic has no outline', () => {
  renderOutline('Plain body without headings.');

  expect(screen.getByRole('heading', { name: 'Outline' })).toBeInTheDocument();
  expect(screen.getByText('This topic has no outline headings yet.')).toBeInTheDocument();
});

it('keeps all outline entries at normal font weight', () => {
  renderOutline('# Title\n\n## First section\n\n### Detail');

  const outlineNav = screen.getByRole('navigation', { name: 'Document outline' });

  expect(screen.getByRole('button', { name: 'First section' })).toHaveClass('font-normal');
  expect(screen.getByRole('button', { name: 'Detail' })).toHaveClass('font-normal');
  expect(outlineNav.querySelector('[class*="font-semibold"]')).toBeNull();
  expect(outlineNav.querySelector('[class*="font-medium"]')).toBeNull();
});

it('hides hierarchy arrows when the outline has only one visible level', () => {
  renderOutline('# Title\n\n## First section\n\n## Second section');

  const outlineNav = screen.getByRole('navigation', { name: 'Document outline' });

  expect(outlineNav.querySelector('svg')).toBeNull();
});

it('shows hierarchy arrows for outline items with children', () => {
  const { container } = renderOutline('# Title\n\n## First section\n\n### Detail');

  expect(container.querySelector('svg')).not.toBeNull();
});

it('keeps visible active outline items in place', () => {
  const scrollTop = resolveOutlineActiveScrollTop({
    containerBottom: 400,
    containerClientHeight: 400,
    containerScrollHeight: 1200,
    containerScrollTop: 200,
    containerTop: 0,
    itemBottom: 260,
    itemTop: 220,
    margin: 32
  });

  expect(scrollTop).toBe(200);
});

it('scrolls the active outline item only far enough to restore visibility', () => {
  const scrollTop = resolveOutlineActiveScrollTop({
    containerBottom: 400,
    containerClientHeight: 400,
    containerScrollHeight: 1200,
    containerScrollTop: 200,
    containerTop: 0,
    itemBottom: 520,
    itemTop: 480,
    margin: 32
  });

  expect(scrollTop).toBe(352);
});
