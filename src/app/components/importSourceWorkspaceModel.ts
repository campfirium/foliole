import {
  applyReadwiseRootPath,
  createDefaultGenericImportSources,
  createDraftImportSource,
  createNextImportSourceIndex,
  createReadwiseImportSources,
  formatReadwiseSourceLabel,
  type ImportManagerSourceDraft as DraftImportSource
} from '../../../lib/core/import/importManagerSettings';
import { appSurfaceControlClassName } from '../../shared/ui';

export type DraftImportSourceField = keyof DraftImportSource;
export type { DraftImportSource };

export const importSourceSelectClassName = appSurfaceControlClassName('h-10 w-full');

export function cloneDraftImportSource(source: DraftImportSource, index: number): DraftImportSource {
  return {
    ...source,
    id: createDraftImportSource(index).id
  };
}

export function updateDraftImportSource(
  source: DraftImportSource,
  field: DraftImportSourceField,
  value: string
): DraftImportSource {
  if (field === 'highlightMode') {
    const highlightMode = value === 'split' ? 'split' : 'merged';
    return {
      ...source,
      highlightMode,
      highlightPath: highlightMode === 'split' ? source.highlightPath : '',
      keepPreview: null,
      keepState: 'draft'
    };
  }

  if (field === 'actionMode') {
    const actionMode = value === 'delete' ? 'delete' : 'keep';
    return {
      ...source,
      actionMode,
      archivePath: ''
    };
  }

  return {
    ...source,
    keepPreview:
      field === 'primaryPath' || field === 'highlightPath'
        ? null
        : source.keepPreview,
    keepState:
      field === 'primaryPath' || field === 'highlightPath'
        ? 'draft'
        : source.keepState,
    [field]: value
  };
}

export {
  applyReadwiseRootPath,
  createDefaultGenericImportSources,
  createDraftImportSource,
  createNextImportSourceIndex,
  createReadwiseImportSources,
  formatReadwiseSourceLabel
};
