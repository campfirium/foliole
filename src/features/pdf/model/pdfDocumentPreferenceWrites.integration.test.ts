// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openNodeSqliteFixture } from '../../../../electron/database/nodeSqliteFixture.testSupport.js';
import { loadAppSettingsState, saveAppSettingsState } from '../../../../electron/ipc/storage.js';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands.js';
import { APP_SETTINGS_STORAGE_KEYS as keys } from '../../../shared/config/appSettings.js';
import { deferred } from '../../../test/deferred.js';

import { DEFAULT_PDF_READING_VIEW } from './pdfReadingView.js';
import { loadPdfReadingView, savePdfReadingView } from './pdfReadingViewRepository.js';
import { loadPdfTopBarsPreference, savePdfTopBarsPreference } from './pdfTopBarsPreferences.js';

const { applyNativeBaseColorMode, writeStartupRendererHtml } = vi.hoisted(() => ({
  applyNativeBaseColorMode: vi.fn(), writeStartupRendererHtml: vi.fn()
}));
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }));
vi.mock('../../../../electron/nativeAppearance.js', () => ({ applyNativeBaseColorMode }));
vi.mock('../../../../electron/startupRendererPreparation.js', () => ({ writeStartupRendererHtml }));
vi.mock('../../../../electron/database/connection.js', () => ({ openDatabaseConnection: () => connection }));

let connection: ReturnType<typeof openNodeSqliteFixture>;
let beforeSave: (() => Promise<void>) | undefined;
const settings = { [keys.baseColor]: 'light', [keys.appDisplayScalePercent]: '120', [keys.listWidth]: '360' };

async function invoke(command: string, args?: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadAppSettingsState) return loadAppSettingsState();
  if (command !== NATIVE_COMMANDS.saveAppSettingsState) throw new Error('Unexpected command');
  await beforeSave?.();
  const save: (settings: Record<string, unknown>, pdfPreference?: unknown) => Promise<void> = saveAppSettingsState;
  return save((args?.settings ?? {}) as Record<string, unknown>, args?.pdfPreference);
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { electronAPI: { invoke } });
  connection = openNodeSqliteFixture();
  await saveAppSettingsState(settings);
});
afterEach(() => {
  beforeSave = undefined;
  vi.unstubAllGlobals();
  connection.sqlite.close();
});

it('saves PDF top bars without clearing the saved appearance or startup settings', async () => {
  await savePdfTopBarsPreference('first', false);
  expect(applyNativeBaseColorMode).toHaveBeenLastCalledWith('light');
  expect(writeStartupRendererHtml).toHaveBeenCalledTimes(1);
  expect(await loadAppSettingsState()).toMatchObject(settings);
  expect(await loadPdfTopBarsPreference('first')).toBe(false);
});

it('keeps newer appearance settings if they commit before an in-flight PDF view save', async () => {
  const entered = deferred<void>();
  const resume = deferred<void>();
  beforeSave = async () => { entered.resolve(); await resume.promise; };
  const view = { ...DEFAULT_PDF_READING_VIEW, mode: 'free' as const };
  const pending = savePdfReadingView('first', view);
  await Promise.race([entered.promise, pending.then(() => {
    throw new Error('The PDF save did not reach the runtime transport');
  })]);
  try {
    await saveAppSettingsState({ ...settings, [keys.baseColor]: 'dark' });
  } finally {
    resume.resolve();
    await pending;
  }
  expect(applyNativeBaseColorMode).toHaveBeenLastCalledWith('dark');
  expect(await loadAppSettingsState()).toMatchObject({ ...settings, [keys.baseColor]: 'dark' });
  expect(await loadPdfReadingView('first')).toEqual(view);
});
