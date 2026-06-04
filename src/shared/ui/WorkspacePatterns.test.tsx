import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { InspectorSection } from './InspectorSection';
import { AppListHeader, AppListItem, AppListSectionHeader, AppListSurface } from './ListSurface';
import { ReviewActionBar } from './ReviewActionBar';
import { ToolbarActionGroup } from './ToolbarActionGroup';

it('renders inspector section with shared header and body copy', () => {
  render(
    <InspectorSection actions={<button type="button">Inspect</button>} description="Shared inspector copy." title="Queue summary">
      <dl>
        <div>Total</div>
      </dl>
    </InspectorSection>
  );

  expect(screen.getByRole('heading', { level: 3, name: 'Queue summary' })).toBeInTheDocument();
  expect(screen.getByText('Shared inspector copy.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
});

it('renders review action bar with primary, secondary, and status slots', () => {
  const { container } = render(
    <ReviewActionBar
      ariaLabel="Review mode toolbar"
      mode="study"
      primary={<button type="button">Show Answer</button>}
      reviewInputMode="hotkeys"
      reviewItemKind="fsrs"
      secondary="Hotkeys enabled"
    />
  );

  expect(container.querySelector('[data-mode="study"]')).toBeInTheDocument();
  expect(screen.getByLabelText('Review mode toolbar').querySelector('.max-w-\\[var\\(--document-max-width\\)\\]')).toBeInTheDocument();
  expect(
    screen.getByLabelText('Review mode toolbar').querySelector(
      '.pl-\\[var\\(--document-content-inline-start-padding\\,var\\(--document-content-inline-padding\\)\\)\\]'
    )
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.getByText('Hotkeys enabled')).toBeInTheDocument();
});

it('renders toolbar action groups with shared grouping semantics', () => {
  render(
    <ToolbarActionGroup ariaLabel="Primary toolbar actions">
      <button type="button">Back</button>
      <button type="button">Forward</button>
    </ToolbarActionGroup>
  );

  expect(screen.getByLabelText('Primary toolbar actions')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Forward' })).toBeInTheDocument();
});

it('renders list surfaces with shared header, rows, and empty state', () => {
  const { rerender } = render(
    <AppListSurface
      ariaLabel="Shared list"
      header={
        <AppListHeader actions={<p>2 items</p>}>
          <p>Unified list header</p>
        </AppListHeader>
      }
    >
      <AppListItem meta="Meta" summary="Summary" title="Entry title" trailing="Updated today" />
    </AppListSurface>
  );

  expect(screen.getByLabelText('Shared list')).toBeInTheDocument();
  expect(screen.getByText('Unified list header')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Entry title/i })).toBeInTheDocument();
  expect(screen.getByText('Updated today')).toBeInTheDocument();

  rerender(
    <AppListSurface
      ariaLabel="Shared list"
      emptyState={{ description: 'Nothing to review yet.', title: 'No entries' }}
      isEmpty
    />
  );

  expect(screen.getByText('No entries')).toBeInTheDocument();
  expect(screen.getByText('Nothing to review yet.')).toBeInTheDocument();
});

it('renders list item meta after the summary when requested', () => {
  render(<AppListItem interactive={false} meta="Path meta" metaAfterSummary summary="Opening summary" title="Entry title" />);

  const rowText = screen.getByText('Entry title').parentElement?.parentElement?.textContent ?? '';
  expect(rowText.indexOf('Opening summary')).toBeLessThan(rowText.indexOf('Path meta'));
});

it('renders shared list section headers with title, description, count, and toolbar', () => {
  render(
    <AppListSectionHeader countLabel="6 items" description="Shared section description." title="Shared section" toolbar={<span>Toolbar row</span>} />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'Shared section' })).toBeInTheDocument();
  expect(screen.getByText('Shared section description.')).toBeInTheDocument();
  expect(screen.getByText('6 items')).toBeInTheDocument();
  expect(screen.getByText('Toolbar row')).toBeInTheDocument();
});
