import type { NativeReadwiseBookEpubLoadResult } from '../../lib/platform/nativeReadwiseContract.js';

import {
  getReadwiseOriginalFileTargetKey,
  getReadwiseOriginalFileTargetTitle,
  type ReadwiseOriginalFileTarget
} from './readwiseOriginalFileTarget.js';

export function createInactiveSourceOriginalFileLoadResult(target: ReadwiseOriginalFileTarget): NativeReadwiseBookEpubLoadResult {
  return {
    book_key: getReadwiseOriginalFileTargetKey(target),
    error_message: 'Readwise actions are available where this source is active.',
    epub_path: null,
    status: 'source_inactive',
    title: getReadwiseOriginalFileTargetTitle(target)
  };
}

export function createCancelledOriginalFileLoadResult(target: ReadwiseOriginalFileTarget): NativeReadwiseBookEpubLoadResult {
  return {
    book_key: getReadwiseOriginalFileTargetKey(target),
    epub_path: null,
    status: 'cancelled',
    title: getReadwiseOriginalFileTargetTitle(target)
  };
}

export function createFailedOriginalFileLoadResult(target: ReadwiseOriginalFileTarget): NativeReadwiseBookEpubLoadResult {
  return {
    book_key: getReadwiseOriginalFileTargetKey(target),
    error_message: 'Could not load this original file. Please try another file.',
    epub_path: null,
    status: 'failed',
    title: getReadwiseOriginalFileTargetTitle(target)
  };
}
