import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppButton } from './Button';
import { AppIconButton } from './IconButton';
import { AppPanel } from './Panel';
import { AppStatusBadge } from './StatusBadge';

it('renders shared control wrappers without Radix theme context', () => {
  const { container } = render(
    <>
      <AppButton variant="primary">Save</AppButton>
      <AppButton variant="list">Topic row</AppButton>
      <AppIconButton icon={<span aria-hidden="true">+</span>} label="Add item" />
      <AppPanel footer={<div>Footer</div>} title="Queue summary">
        <p>Panel body</p>
      </AppPanel>
      <AppStatusBadge label="Ready" tone="info" />
    </>
  );

  expect(screen.getByRole('button', { name: 'Save' }).tagName).toBe('BUTTON');
  expect(screen.getByRole('button', { name: 'Topic row' }).className).toContain('focus:outline-none');
  expect(screen.getByRole('button', { name: 'Topic row' }).className).toContain('focus-visible:ring-ring');
  expect(screen.getByRole('button', { name: 'Add item' }).className).toContain('focus:outline-none');
  expect(screen.getByRole('button', { name: 'Add item' }).className).toContain('focus-visible:ring-ring');
  expect(screen.getByRole('heading', { level: 3, name: 'Queue summary' }).tagName).toBe('H3');
  expect(screen.getByText('Panel body')).toBeInTheDocument();
  expect(screen.getByText('Ready').tagName).toBe('SPAN');
  expect(container.querySelector('.radix-themes')).toBeNull();
});

it('applies shared scrollbar styling to scrollable panel bodies', () => {
  const { container } = render(
    <AppPanel scrollBody title="Queue summary">
      <p>Panel body</p>
    </AppPanel>
  );

  expect(container.querySelector('.app-scrollbar.overflow-auto')).not.toBeNull();
});
