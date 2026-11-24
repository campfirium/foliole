// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { SuperMemoDraftActions } from './SuperMemoDraftActions';

it('navigates backward and forward and keeps conversion as an explicit action', () => {
  const navigate = vi.fn();
  const convert = vi.fn();
  const props = { busy: false, canProceed: true, hasPreview: true, navigate, convert };
  const { rerender } = render(<SuperMemoDraftActions {...props} step="load" />);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(navigate).toHaveBeenLastCalledWith('structure');

  rerender(<SuperMemoDraftActions {...props} step="schedule" />);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(navigate).toHaveBeenLastCalledWith('structure');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(navigate).toHaveBeenLastCalledWith('priority');
  rerender(<SuperMemoDraftActions {...props} step="priority" />);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(navigate).toHaveBeenLastCalledWith('schedule');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(navigate).toHaveBeenLastCalledWith('grades');

  rerender(<SuperMemoDraftActions {...props} step="grades" referenceMapValid={false} />);
  expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  rerender(<SuperMemoDraftActions {...props} step="grades" />);
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  expect(convert).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(navigate).toHaveBeenLastCalledWith('priority');

  rerender(<SuperMemoDraftActions {...props} step="structure" busy />);
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});
