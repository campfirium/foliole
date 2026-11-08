import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { AddToDiveDialog } from './AddToDiveDialog';

it('selects a Dive using the same palette and submits the folder itself with the topic', () => {
  const onAdd = vi.fn();
  renderWithLocalization(
    <AddToDiveDialog
      dives={[
        { id: 'existing', title: 'Already added', directSourceIds: ['folder', 'topic'] },
        { id: 'bayes', title: 'Bayesian inference', directSourceIds: [] }
      ]}
      onAdd={onAdd}
      onClose={vi.fn()}
      sourceIds={['folder', 'topic']}
    />
  );

  expect(screen.queryByRole('button', { name: 'Already added' })).toBeNull();
  const input = screen.getByRole('textbox', { name: 'Add to Dive' });
  fireEvent.change(input, { target: { value: 'bayes' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(onAdd).toHaveBeenCalledExactlyOnceWith('bayes', ['folder', 'topic']);
});
