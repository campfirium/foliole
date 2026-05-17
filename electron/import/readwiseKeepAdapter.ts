import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import {
  loadPreparedReadwiseImportRecord,
  resolveReadwiseSourceImportDecision,
  resolveReadwiseSourceSignature,
  shouldImportReadwiseSource
} from './readwisePreparedImport.js';

export interface ReadwiseKeepAdapterInput {
  highlightDirectoryPath: string;
  readwiseConfig: ReadwiseReaderConfig;
}

export interface ReadwiseKeepPreparedRecordInput extends ReadwiseKeepAdapterInput {
  highlightPolicy: ImportHighlightPolicy;
  importedAt: string;
  kind: ReadwiseSourceKind;
}

export const readwiseKeepAdapter = {
  loadPreparedRecord(source: DirectoryImportSourceDescriptor, input: ReadwiseKeepPreparedRecordInput) {
    return loadPreparedReadwiseImportRecord(source, input);
  },
  resolveImportDecision(source: DirectoryImportSourceDescriptor, input: ReadwiseKeepAdapterInput) {
    return resolveReadwiseSourceImportDecision(source, input);
  },
  resolveSourceSignature(source: DirectoryImportSourceDescriptor, input: { highlightDirectoryPath: string }) {
    return resolveReadwiseSourceSignature(source, input);
  },
  shouldImportSource(source: DirectoryImportSourceDescriptor, input: ReadwiseKeepAdapterInput) {
    return shouldImportReadwiseSource(source, input);
  }
};
