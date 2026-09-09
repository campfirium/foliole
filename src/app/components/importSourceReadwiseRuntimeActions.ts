import type { ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import {
  previewReadwiseImportCleanupInRuntime,
  runReadwiseImportCleanupInRuntime
} from '../../shared/platform/readwiseImportCleanupRuntimeRepository';
import {
  cancelReadwiseReaderImportInRuntime,
  previewReadwiseReaderImportInRuntime,
  runReadwiseReaderImportInRuntime
} from '../../shared/platform/readwiseReaderImportRuntimeRepository';

import type { DraftImportSource } from './importSourceWorkspaceModel';

type SetSettings = (updater: (current: ImportManagerSettings) => ImportManagerSettings) => void;

interface ReadwiseSetupInput {
  config: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

export function createReadwiseReaderImportActions(
  settings: ImportManagerSettings,
  setSettings: SetSettings
) {
  function mergeReadwiseSetup(input: ReadwiseSetupInput): ImportManagerSettings {
    return {
      ...settings,
      readwiseReaderConfig: input.config,
      readwiseRootPath: input.readwiseRootPath,
      readwiseSources: input.readwiseSources
    };
  }

  return {
    previewReadwiseReaderImport(input: ReadwiseSetupInput) {
      return previewReadwiseReaderImportInRuntime(mergeReadwiseSetup(input));
    },
    runReadwiseReaderImport(input: ReadwiseSetupInput) {
      const nextSettings = mergeReadwiseSetup(input);
      setSettings(() => nextSettings);
      return runReadwiseReaderImportInRuntime(nextSettings);
    },
    cancelReadwiseReaderImport: cancelReadwiseReaderImportInRuntime,
    previewReadwiseImportCleanup: previewReadwiseImportCleanupInRuntime,
    runReadwiseImportCleanup: runReadwiseImportCleanupInRuntime
  };
}
