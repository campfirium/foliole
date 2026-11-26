import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionPriorityControl } from './CompanionPriorityControl';

afterEach(cleanup);

it('keeps just one editable slider with a fixed enforced value and its source below', () => {
  const save = vi.fn();
  renderWithLocalization(<CompanionPriorityControl disabled={false} ownPriority={6}
    value={6} enforced={{ value: 2, owner: 'English reading' }} onCommit={save} />);

  const priority = within(screen.getByRole('region', { name: 'Priority' }));
  const slider = priority.getByRole('slider');
  const effective = priority.getByRole('img', { name: 'Effective priority P2' });
  expect(priority.queryByRole('button')).toBeNull();
  expect(priority.getByText('English reading')).toBeVisible();
  expect(slider).toBeEnabled();
  const position = effective.style.left;
  fireEvent.input(slider, { target: { value: '7' } });
  expect(priority.getByText('P7')).toBeVisible();
  expect(effective.style.left).toBe(position);
  expect(save).not.toHaveBeenCalled();

  fireEvent.pointerCancel(slider);
  expect(slider).toHaveValue('6');
  fireEvent.change(slider, { target: { value: '7' } });
  expect(save).toHaveBeenCalledExactlyOnceWith(7);
});

it('shows a single effective marker until an own priority is selected', () => {
  renderWithLocalization(<CompanionPriorityControl disabled={false} ownPriority={null}
    value={5} enforced={{ value: 2, owner: 'English reading' }} onCommit={vi.fn()} />);

  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '—');
  expect(screen.getByRole('img', { name: 'Effective priority P2' })).toBeVisible();
});
