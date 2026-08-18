import type { Locator, Page } from '@playwright/test';

const BACKUPS_HEADING_NAME = /^(Backups|备份)$/;
const CATEGORY_NAMES = {
  Appearance: /^(Appearance|外观)$/,
  Backups: /^(Backups|备份)$/,
  ExternalFolder: /^(External folders|外部文件夹)$/,
  General: /^(General|通用)$/,
  Hotkeys: /^(Hotkeys|快捷键)$/,
  Import: /^(Watched folders|监听文件夹)$/,
  ReadwiseReader: /^Readwise Reader$/,
  Sync: /^(Sync|同步)$/,
  EditorMenu: /^(Editor menu|编辑器菜单)$/,
  Typography: /^(Typography|字体与排版)$/
} as const;
const SETTINGS_CATEGORIES_LABEL = /^(Settings categories|设置分类)$/;
const SETTINGS_BUTTON_NAME = /^(Settings|设置)$/;
const WORKSPACE_LABEL = /^(Foliole workspace|Foliole 工作区)$/;

async function waitForVisible(locator: Locator) {
  await locator.waitFor({ state: 'visible' });
}

export function getSettingsDialog(windowPage: Page): Locator {
  return windowPage.getByRole('dialog').filter({
    has: windowPage.getByLabel(SETTINGS_CATEGORIES_LABEL)
  });
}

export async function expectWorkspaceShell(windowPage: Page) {
  await waitForVisible(windowPage.getByLabel(WORKSPACE_LABEL));
}

export async function openSettingsDialog(windowPage: Page) {
  const settingsDialog = getSettingsDialog(windowPage);

  if (!(await settingsDialog.isVisible())) {
    await windowPage.getByRole('button', { name: SETTINGS_BUTTON_NAME }).click();
  }

  await waitForVisible(settingsDialog);
  return settingsDialog;
}

export async function openSettingsCategory(windowPage: Page, categoryName: string) {
  const settingsDialog = await openSettingsDialog(windowPage);
  const category = CATEGORY_NAMES[categoryName as keyof typeof CATEGORY_NAMES] ?? categoryName;
  await settingsDialog.getByRole('button', {
    name: category
  }).click();
  await waitForVisible(settingsDialog.getByRole('heading', { level: 2, name: category }));
  return settingsDialog;
}

export async function openBackupsSection(windowPage: Page) {
  const settingsDialog = await openSettingsCategory(windowPage, 'Backups');
  await waitForVisible(settingsDialog.getByRole('heading', { level: 2, name: BACKUPS_HEADING_NAME }));
  return settingsDialog;
}
