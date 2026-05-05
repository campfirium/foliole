import { expect, test, type Page } from '@playwright/test';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REVIEW_SETTINGS_STORAGE_KEY = 'foliole-mock-review-scheduler-settings';

const DEFAULT_REVIEW_SCHEDULER_SETTINGS = {
  algorithm: 'ts-fsrs@4.3.0',
  desiredRetention: 0.9,
  maximumIntervalDays: 36500,
  enableFuzz: false,
  enableShortTerm: false,
  pushQueue: {
    defaultPriority: 5,
    priorityRatio: 5,
    queueMixRatio: { reading: 1, fsrs: 5 },
    readingInitialIntervalMs: DAY_IN_MS,
    readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
  },
  updatedAt: '1970-01-01T00:00:00.000Z'
};

async function installMockDesktopRuntime(page: Page) {
  await page.addInitScript(({ reviewSettingsStorageKey, defaultReviewSchedulerSettings }) => {
    localStorage.setItem('foliole-settings-active-category', 'review');
    if (!localStorage.getItem(reviewSettingsStorageKey)) {
      localStorage.setItem(reviewSettingsStorageKey, JSON.stringify(defaultReviewSchedulerSettings));
    }

    const workspaceSnapshot = {
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {},
      trashedNodeIds: []
    };

    window.electronAPI = {
      invoke: async (command: string, payload?: { settings?: unknown }) => {
        switch (command) {
          case 'window_is_maximized':
            return false;
          case 'load_app_settings_state':
            return {};
          case 'save_app_settings_state':
            return null;
          case 'load_workspace_snapshot':
            return workspaceSnapshot;
          case 'load_reading_progress':
            return null;
          case 'load_review_scheduler_settings':
            return JSON.parse(
              localStorage.getItem(reviewSettingsStorageKey) ??
                JSON.stringify(defaultReviewSchedulerSettings)
            );
          case 'save_review_scheduler_settings': {
            const nextSettings = payload?.settings ?? defaultReviewSchedulerSettings;
            localStorage.setItem(reviewSettingsStorageKey, JSON.stringify(nextSettings));
            return nextSettings;
          }
          case 'boot_report':
            return null;
          default:
            return null;
        }
      },
      onNativeMenuCommand: () => () => undefined,
      onWindowResized: () => () => undefined
    };
  }, {
    reviewSettingsStorageKey: REVIEW_SETTINGS_STORAGE_KEY,
    defaultReviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
  });
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings dialog' })).toBeVisible();
}

async function closeSettings(page: Page) {
  await page.locator('[aria-label="Settings"][role="presentation"]').click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('dialog', { name: 'Settings dialog' })).toBeHidden();
}

test('review settings keep push queue defaults and saved values across reopen', async ({ page }) => {
  await installMockDesktopRuntime(page);
  await page.goto('/');

  await openSettings(page);

  const readingMixInput = page.getByLabel('Reading queue mix ratio');
  const fsrsMixInput = page.getByLabel('FSRS queue mix ratio');
  const priorityRatioInput = page.getByLabel('Priority weight ratio');
  const readingInitialIntervalInput = page.getByLabel('Reading initial interval days');
  const readingGrowthMinInput = page.getByLabel('Reading growth factor min');
  const readingGrowthMaxInput = page.getByLabel('Reading growth factor max');

  await expect(readingMixInput).toHaveValue('1');
  await expect(fsrsMixInput).toHaveValue('5');
  await expect(priorityRatioInput).toHaveValue('5');
  await expect(readingInitialIntervalInput).toHaveValue('1');
  await expect(readingGrowthMinInput).toHaveValue('1.1');
  await expect(readingGrowthMaxInput).toHaveValue('1.5');

  await readingMixInput.fill('2');
  await fsrsMixInput.fill('4');
  await priorityRatioInput.fill('7');
  await readingInitialIntervalInput.fill('2');
  await readingGrowthMinInput.fill('1.12');
  await readingGrowthMaxInput.fill('1.44');

  await expect(readingMixInput).toHaveValue('2');
  await expect(fsrsMixInput).toHaveValue('4');
  await expect(priorityRatioInput).toHaveValue('7');
  await expect(readingInitialIntervalInput).toHaveValue('2');
  await expect(readingGrowthMinInput).toHaveValue('1.12');
  await expect(readingGrowthMaxInput).toHaveValue('1.44');

  await closeSettings(page);
  await openSettings(page);

  await expect(readingMixInput).toHaveValue('2');
  await expect(fsrsMixInput).toHaveValue('4');
  await expect(priorityRatioInput).toHaveValue('7');
  await expect(readingInitialIntervalInput).toHaveValue('2');
  await expect(readingGrowthMinInput).toHaveValue('1.12');
  await expect(readingGrowthMaxInput).toHaveValue('1.44');

  await page.reload();
  await openSettings(page);

  await expect(page.getByLabel('Reading queue mix ratio')).toHaveValue('2');
  await expect(page.getByLabel('FSRS queue mix ratio')).toHaveValue('4');
  await expect(page.getByLabel('Priority weight ratio')).toHaveValue('7');
  await expect(page.getByLabel('Reading initial interval days')).toHaveValue('2');
  await expect(page.getByLabel('Reading growth factor min')).toHaveValue('1.12');
  await expect(page.getByLabel('Reading growth factor max')).toHaveValue('1.44');
});
