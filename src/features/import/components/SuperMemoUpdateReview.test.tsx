// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';

import { SuperMemoUpdateReview } from './SuperMemoUpdateReview';

it('keeps withdrawal selections when reviewing other categories before confirming the batch', () => {
  const update: NativeSuperMemoDirectoryUpdate = {
    batchId: 'saved-batch', signature: 'reviewed', pairedSourceRequired: false,
    changes: [], citationChanges: [], firstReviewChanges: [], withdrawnSourceIds: [],
    textChanges: [{ sourceId: 1, title: 'Edited card', field: 'question', status: 'protected', reason: 'edited' }],
    withdrawals: [{ sourceId: 2, title: 'Obsolete card', issue: 'empty-item' }]
  };
  const apply = vi.fn();
  render(<SuperMemoUpdateReview update={update} busy={false} onClose={vi.fn()} onApply={apply} />);
  const text = screen.getByRole('button', { name: /^Text changes\s*\(1\)$/ });
  const withdrawals = screen.getByRole('button', { name: /^Withdraw imported materials\s*\(1\)$/ });
  const confirm = screen.getByRole('button', { name: 'Confirm Update' });

  expect(text).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Edited card · Question')).toBeVisible();
  expect(screen.queryByRole('checkbox', { name: 'Obsolete card' })).toBeNull();
  expect(confirm).toBeDisabled();

  fireEvent.click(withdrawals);
  expect(screen.queryByText('Edited card · Question')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Obsolete card' }));
  fireEvent.click(text);
  fireEvent.click(withdrawals);
  expect(screen.getByRole('checkbox', { name: 'Obsolete card' })).toBeChecked();
  fireEvent.click(text);
  fireEvent.click(confirm);
  expect(apply).toHaveBeenCalledExactlyOnceWith([2]);
});
