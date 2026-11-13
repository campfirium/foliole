import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, onTestFinished, vi } from 'vitest';

import { getStoredAppLocale, setStoredAppLocale } from '../../shared/localization/appLanguage';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import { AppConfirmationProvider } from '../../shared/ui/AppConfirmationProvider';

import { runResetImportDataCommand } from './appPaletteResetImportCommand';

it('explains the import reset in the selected language and allows cancellation', async () => {
  const previousLocale = getStoredAppLocale();
  await preloadTranslationCatalog('zh-Hans');
  setStoredAppLocale('zh-Hans');
  onTestFinished(() => setStoredAppLocale(previousLocale));
  const resetImportData = vi.fn(async () => true);
  render(
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <AppConfirmationProvider>
        <button onClick={() => runResetImportDataCommand({ resetImportData })}>Open</button>
      </AppConfirmationProvider>
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = within(await screen.findByRole('dialog', { name: '重置已导入的主题？' }));
  expect(dialog.getByText('这将移除已导入的主题和导入记录，且无法撤销。')).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: '重置' })).toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: '取消' }));
  expect(resetImportData).not.toHaveBeenCalled();
});
