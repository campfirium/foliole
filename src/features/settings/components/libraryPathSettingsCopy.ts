import type { TranslationKey, TranslationParams } from '../../../shared/localization/translations';
import type {
  RuntimeLibraryPathLocation,
  RuntimeLibraryPaths
} from '../../../shared/platform/libraryPathsRuntimeRepository';
import { requestAppConfirmation } from '../../../shared/ui';

export type LibraryPathTranslate = (key: TranslationKey, params?: TranslationParams) => string;

export function createUnavailableLibraryPaths(t: LibraryPathTranslate): RuntimeLibraryPaths {
  const unavailable = t('settings.library.paths.unavailable');
  return {
    assetsDir: unavailable,
    dataDir: unavailable,
    databasePath: unavailable,
    inbox: unavailable,
    libraryHome: unavailable,
    mirror: unavailable,
    updatedAt: '1970-01-01T00:00:00.000Z'
  };
}

export function getLibraryPathChangeErrorMessage(location: RuntimeLibraryPathLocation, t: LibraryPathTranslate) {
  return t(resolveLibraryPathChangeErrorKey(location));
}

export function getLibraryPathRestoreErrorMessage(location: RuntimeLibraryPathLocation, t: LibraryPathTranslate) {
  return t(resolveLibraryPathRestoreErrorKey(location));
}

export function formatLibraryPathLocationError(fallbackMessage: string, error: unknown, t: LibraryPathTranslate) {
  if (error instanceof Error && error.message.trim().length > 0) {
    console.warn('[library-paths] settings update failed:', error);
  }
  return t('settings.library.paths.error.retryWritable', { message: fallbackMessage });
}

export function confirmExistingLibraryHome(path: string, t: LibraryPathTranslate) {
  return requestAppConfirmation({
    confirmLabel: t('settings.library.existingHome.confirm'),
    description: [
      t('settings.library.existingHome.foundDatabase', { path }),
      t('settings.library.existingHome.keepCurrent')
    ],
    title: t('settings.library.existingHome.title')
  });
}

function resolveLibraryPathChangeErrorKey(location: RuntimeLibraryPathLocation): TranslationKey {
  if (location === 'library_home') return 'settings.library.paths.error.chooseLibraryHome';
  if (location === 'assets_dir') return 'settings.library.paths.error.chooseAssets';
  if (location === 'mirror') return 'settings.library.paths.error.chooseMirror';
  return 'settings.library.paths.error.chooseInbox';
}

function resolveLibraryPathRestoreErrorKey(location: RuntimeLibraryPathLocation): TranslationKey {
  if (location === 'library_home') return 'settings.library.paths.error.restoreLibraryHome';
  if (location === 'assets_dir') return 'settings.library.paths.error.restoreAssets';
  if (location === 'mirror') return 'settings.library.paths.error.restoreMirror';
  return 'settings.library.paths.error.restoreInbox';
}
