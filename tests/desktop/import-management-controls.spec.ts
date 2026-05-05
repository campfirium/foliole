import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function openImportManagement(windowPage: Parameters<typeof expectWorkspaceShell>[0]) {
  await expectWorkspaceShell(windowPage);
  await windowPage.getByRole('button', { name: 'Import Management' }).click();
  await expect(windowPage.getByRole('dialog', { name: 'Import management' })).toBeVisible();
}

async function openImportPage(windowPage: Parameters<typeof expectWorkspaceShell>[0], pageName: 'Imports' | 'Readwise Books' | 'PDF') {
  await windowPage.getByRole('navigation', { name: 'Import management navigation' }).getByRole('button', { name: pageName, exact: true }).click();
  await expect(windowPage.getByLabel(`${pageName} page`)).toBeVisible();
}

async function expectSearchResponds(windowPage: Parameters<typeof expectWorkspaceShell>[0], searchLabel: string, emptyMessage: string) {
  const searchbox = windowPage.getByRole('searchbox', { name: searchLabel });
  await searchbox.fill('zzzz-playwright-no-match');
  await expect(windowPage.getByText(emptyMessage)).toBeVisible();
  await searchbox.fill('');
  await expect(windowPage.getByText(emptyMessage)).toHaveCount(0);
}

async function expectSortMenuResponds(windowPage: Parameters<typeof expectWorkspaceShell>[0], buttonLabel: string, itemName: RegExp, nextButtonLabel: string) {
  await windowPage.getByRole('button', { name: buttonLabel }).click();
  await windowPage.getByRole('menuitem', { name: itemName }).click();
  await expect(windowPage.getByRole('button', { name: nextButtonLabel })).toBeVisible();
}

test.describe('import management desktop controls', () => {
  test('search and sort respond across imports pages', async ({ desktopWindow }) => {
    await openImportManagement(desktopWindow);

    await openImportPage(desktopWindow, 'Imports');
    await expectSearchResponds(desktopWindow, 'Search all imports', 'Imports are empty');
    await expectSortMenuResponds(desktopWindow, 'Sort imports by Date saved', /Title/, 'Sort imports by Title');

    await openImportPage(desktopWindow, 'Readwise Books');
    await expectSearchResponds(desktopWindow, 'Search imported books', 'Readwise Books is empty');
    await expectSortMenuResponds(
      desktopWindow,
      'Sort imports by Date saved',
      /Date last opened/,
      'Sort imports by Date last opened'
    );

    await openImportPage(desktopWindow, 'PDF');
    await expectSearchResponds(desktopWindow, 'Search imported PDFs', 'PDF is empty');
    await expectSortMenuResponds(desktopWindow, 'Sort imports by Date saved', /Title/, 'Sort imports by Title');
  });
});
