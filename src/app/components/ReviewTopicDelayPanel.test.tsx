import { fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewTopicDelayPanel } from './ReviewTopicDelayPanel';

function renderPanel(overrides: Partial<Parameters<typeof ReviewTopicDelayPanel>[0]> = {}) {
  const props = {
    changeUnit: vi.fn(),
    close: vi.fn(),
    dueDateLabel: 'Jun 22, 2026',
    errorMessage: null,
    isOpen: true,
    isSubmitting: false,
    open: vi.fn(),
    previewDays: (days: number) => days >= 0 ? `Jun ${days}, 2026` : null,
    selectedLevel: 4,
    setSelectedLevel: vi.fn(),
    submit: vi.fn(async () => true),
    unit: 'weeks' as const,
    ...overrides
  };
  renderWithLocalization(<ReviewTopicDelayPanel {...props} />);
  return props;
}

it('shows the compact centered postpone layout without trigger shortcut text', () => {
  renderPanel();

  const dialog = screen.getByRole('dialog', { name: 'Postpone Topic' });
  expect(dialog).toBeInTheDocument();
  expect(dialog.parentElement).toHaveClass('z-modal');
  expect(screen.getByText('Postpone')).toBeInTheDocument();
  expect(screen.queryByText('Ctrl J')).not.toBeInTheDocument();
  expect(screen.getByText('0-9')).toBeInTheDocument();
  expect(screen.getByText('apply instantly')).toBeInTheDocument();
  expect(screen.getByText('Jun 22, 2026')).toBeInTheDocument();
  expect(screen.getByText('0W')).toBeInTheDocument();
  expect(screen.getByText('9W')).toBeInTheDocument();
});

it('closes with Escape and applies digit keys immediately', () => {
  const props = renderPanel();

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(props.close).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(window, { key: '7' });
  expect(props.submit).toHaveBeenCalledWith(7);
});

it('closes from the Cancel button', () => {
  const props = renderPanel();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(props.close).toHaveBeenCalledTimes(1);
});

it('focuses day input and waits for one submission of the whole number', () => {
  const props = renderPanel({ unit: 'days' });
  const input = screen.getByRole('textbox', { name: 'Days until next appearance' });
  expect(input).toHaveFocus();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } });
  expect(input).toHaveValue('5');
  expect(screen.getByRole('status')).toHaveTextContent('Jun 5, 2026');
  fireEvent.keyDown(input, { key: '1' });
  fireEvent.change(input, { target: { value: '14' } });
  expect(screen.getByRole('status')).toHaveTextContent('Jun 14, 2026');
  expect(props.submit).not.toHaveBeenCalled();
  fireEvent.submit(input.closest('form')!);
  expect(props.submit).toHaveBeenCalledExactlyOnceWith(14);
});

it('offers the unit switch in the postpone panel', () => {
  const props = renderPanel();
  fireEvent.keyDown(screen.getByRole('button', { name: 'By week' }), { key: 'ArrowDown' });
  expect(screen.getByRole('menuitemradio', { name: 'By week', checked: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'By day' }));
  expect(props.changeUnit).toHaveBeenCalledExactlyOnceWith('days');
  expect(props.submit).not.toHaveBeenCalled();
});

afterEach(() => localStorage.removeItem('foliole-app-language'));

it.each([
  { unit: 'weeks' as const, mode: '按周', label: '周' },
  { unit: 'days' as const, mode: '按天', label: '天' }
])('localizes the visible $unit label in Chinese while keeping the slider notation', ({ unit, mode, label }) => {
  localStorage.setItem('foliole-app-language', 'zh-Hans');
  renderPanel({ unit });
  expect(screen.getByRole('button', { name: mode })).toBeInTheDocument();
  expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
  expect(screen.getByText(unit === 'weeks' ? '9W' : '30D')).toBeInTheDocument();
});

it('allows zero days to restore scheduling without treating an empty draft as zero', () => {
  const props = renderPanel({ unit: 'days' });
  const input = screen.getByRole('textbox', { name: 'Days until next appearance' });
  fireEvent.change(input, { target: { value: '2' } });
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '0' } });
  expect(input).toHaveValue('0');
  fireEvent.submit(input.closest('form')!);
  expect(props.submit).toHaveBeenCalledExactlyOnceWith(0);
});
