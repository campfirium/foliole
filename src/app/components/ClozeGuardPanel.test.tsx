import { fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ClozeGuardPanel } from './ClozeGuardPanel';

it('cancels the cloze guard panel on Escape', () => {
  const onCancel = vi.fn();
  renderWithLocalization(
    <ClozeGuardPanel
      left={16}
      onCancel={onCancel}
      onCreateCloze={vi.fn()}
      onCreateHighlight={vi.fn()}
      top={24}
    />
  );

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(onCancel).toHaveBeenCalledTimes(1);
});
