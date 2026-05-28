import {
  requestClipboardImport,
  requestFileImport
} from '../components/importActivityRequests';

import type { useFormalImport } from './useFormalImport';

export function createPaletteImportActions(formalImport: ReturnType<typeof useFormalImport>) {
  return {
    importDirectory: formalImport.startImportDirectory,
    importSingleFile: requestFileImport,
    resetImportData: formalImport.resetImportData,
    startClipboardImport: requestClipboardImport
  };
}
