import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { InspectorSection } from './InspectorSection';
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
      status={<p>Queue status</p>}
    />
  );

  expect(container.querySelector('[data-mode="study"]')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.getByText('Hotkeys enabled')).toBeInTheDocument();
  expect(screen.getByText('Queue status')).toBeInTheDocument();
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
