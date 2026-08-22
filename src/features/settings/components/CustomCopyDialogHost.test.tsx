import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { LocalizationProvider, useTranslation } from '../../../shared/localization/LocalizationProvider';
import { requestCustomCopyDialogOpen } from '../model/customCopyDialogRequests';

import { CustomCopyDialogHost } from './CustomCopyDialogHost';

function CloseCopy() {
  const t = useTranslation();
  return <span data-testid="close-copy">{t('shared.close')}</span>;
}

beforeEach(() => window.localStorage.clear());

it('searches copy and applies a double-click edit to translated consumers', () => {
  render(
    <LocalizationProvider initialLanguagePreference="en">
      <CloseCopy />
      <CustomCopyDialogHost />
    </LocalizationProvider>
  );

  act(() => requestCustomCopyDialogOpen());
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search copy to change' }), {
    target: { value: 'shared.close' }
  });
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Customize shared.close' }));
  const input = screen.getByRole('textbox', { name: 'Customize shared.close' });
  fireEvent.change(input, { target: { value: 'Dismiss' } });
  fireEvent.blur(input);

  expect(screen.getByTestId('close-copy')).toHaveTextContent('Dismiss');
  expect(window.localStorage.getItem('foliole-custom-copy-overrides-v1')).toContain('Dismiss');
});
