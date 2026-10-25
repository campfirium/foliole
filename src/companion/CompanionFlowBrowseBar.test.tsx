import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionFlowBrowseBar } from './CompanionFlowBrowseBar';

it('offers only the shared Resume action in the review toolbar', () => {
  const resume = vi.fn();
  renderWithLocalization(<CompanionFlowBrowseBar onResume={resume} />);
  expect(screen.queryByRole('button', { name: 'Exit' })).not.toBeInTheDocument();
  const toolbar = screen.getByRole('group', { name: 'Companion review toolbar' });
  expect(within(toolbar).getAllByRole('button')).toHaveLength(1);
  fireEvent.click(within(toolbar).getByRole('button', { name: 'Resume review' }));
  expect(resume).toHaveBeenCalledOnce();
});
