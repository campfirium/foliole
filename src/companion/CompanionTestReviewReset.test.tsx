import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const reset = vi.hoisted(() => ({ supported: vi.fn(), run: vi.fn() }));
vi.mock('../shared/platform/companionTestReviewReset', () => ({
  supportsCompanionTestReviewReset: reset.supported, resetCompanionTestItemReviews: reset.run
}));

import { CompanionTestReviewReset } from './CompanionTestReviewReset';

beforeEach(() => { reset.supported.mockResolvedValue(true); reset.run.mockReset(); });

it('requires confirmation, allows cancellation, and refreshes only after a successful reset', async () => {
  const complete = vi.fn();
  render(<CompanionTestReviewReset onComplete={complete} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reset item reviews' }));
  expect(reset.run).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toHaveTextContent('same test sync group');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(reset.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reset item reviews' }));
  reset.run.mockResolvedValue(['a']);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset item reviews' }));
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(reset.run).toHaveBeenCalledOnce();
});

it('prevents duplicate submissions and shows a retryable error without refreshing', async () => {
  let reject!: (error: Error) => void;
  reset.run.mockReturnValue(new Promise((_resolve, rejectRun) => { reject = rejectRun; }));
  const complete = vi.fn();
  render(<CompanionTestReviewReset onComplete={complete} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reset item reviews' }));
  const button = within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset item reviews' });
  fireEvent.click(button); fireEvent.click(button);
  expect(reset.run).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  reject(new Error('full'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again');
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
});

it.each([false, 'error'])('does not expose reset when support is %s', async supported => {
  if (supported === 'error') reset.supported.mockRejectedValue(new Error('unavailable'));
  else reset.supported.mockResolvedValue(false);
  render(<CompanionTestReviewReset />);
  await waitFor(() => expect(reset.supported).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Reset item reviews' })).not.toBeInTheDocument();
});
