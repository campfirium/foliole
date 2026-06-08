import { render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog } from '../localization/translations';

import { AppButton } from './Button';
import { AppIconButton } from './IconButton';
import { AppPanel } from './Panel';
import { AppStatusBadge } from './StatusBadge';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

it('maps button variants to the desktop action hierarchy', () => {
  render(
    <>
      <AppButton>Default</AppButton>
      <AppButton variant="ghost">Ghost</AppButton>
      <AppButton variant="subtle">Subtle</AppButton>
      <AppButton variant="emphasis">Emphasis</AppButton>
      <AppButton variant="danger">Danger</AppButton>
      <AppButton active variant="list">List</AppButton>
    </>
  );

  expect(screen.getByRole('button', { name: 'Default' }).className).toContain('--app-control-border-color');
  expect(screen.getByRole('button', { name: 'Default' }).className).toContain('text-ui-md');
  expect(screen.getByRole('button', { name: 'Ghost' }).className).toContain('border-transparent');
  expect(screen.getByRole('button', { name: 'Subtle' }).className).toContain('text-foreground/70');
  expect(screen.getByRole('button', { name: 'Emphasis' }).className).toContain('--color-accent-strong');
  expect(screen.getByRole('button', { name: 'Danger' }).className).toContain('border-error/35');
  expect(screen.getByRole('button', { name: 'List' }).className).toContain('w-full');
  expect(screen.getByRole('button', { name: 'List' }).className).toContain('text-ui-base');
  expect(screen.getByRole('button', { name: 'List' }).className).toContain('border-border-strong');
});

it('renders shared control wrappers without Radix theme context', () => {
  const { container } = render(
    <>
      <AppButton variant="default">Save</AppButton>
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
  expect(screen.getByRole('heading', { level: 3, name: 'Queue summary' }).className).toContain('text-ui-md');
  expect(screen.getByText('Panel body')).toBeInTheDocument();
  expect(screen.getByText('Ready').tagName).toBe('SPAN');
  expect(screen.getByText('Ready').className).toContain('text-ui-md');
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
