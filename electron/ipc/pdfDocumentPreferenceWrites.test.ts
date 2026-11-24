// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { DEFAULT_PDF_READING_VIEW } from '../../src/features/pdf/model/pdfReadingView.js';
import { loadPdfReadingView, savePdfReadingView } from '../../src/features/pdf/model/pdfReadingViewRepository.js';
import { loadPdfTopBarsPreference, savePdfTopBarsPreference } from '../../src/features/pdf/model/pdfTopBarsPreferences.js';
import { APP_SETTINGS_STORAGE_KEYS as keys } from '../../src/shared/config/appSettings.js';
import { openNodeSqliteFixture } from '../database/nodeSqliteFixture.testSupport.js';

import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

const { applyNativeBaseColorMode, writeStartupRendererHtml } = vi.hoisted(() => ({
  applyNativeBaseColorMode: vi.fn(), writeStartupRendererHtml: vi.fn()
}));
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }));
vi.mock('../nativeAppearance.js', () => ({ applyNativeBaseColorMode }));
vi.mock('../startupRendererPreparation.js', () => ({ writeStartupRendererHtml }));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => connection }));

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
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
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
