import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../lib/platform/nativeReadwiseContract.js';
import { canDesktopRunExternalSources } from '../sync/primaryDeviceState.js';

import type { ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';

export function canRunReadwiseExternalSource(input: { readwiseReaderEnabled?: boolean } = {}) {
  return canDesktopRunExternalSources() && input.readwiseReaderEnabled !== false;
}

export function createReadwiseSecondaryDeviceMessage() {
  return 'Readwise actions run on the current primary device. Set this device as primary before changing Readwise imports.';
}

export function createBlockedReadwiseBookDownloadResult(book: ReadwiseBookInventoryItem): NativeReadwiseBookDownloadResult {
  return { book_key: book.bookKey, status: 'blocked_secondary', title: book.title, url: null };
}

export function createBlockedReadwiseBookEpubResult(book: ReadwiseBookInventoryItem): NativeReadwiseBookEpubLoadResult {
  return {
    book_key: book.bookKey,
    error_message: createReadwiseSecondaryDeviceMessage(),
    epub_path: null,
    status: 'blocked_secondary',
    title: book.title
  };
}

export function createReadwiseBookEpubFailureResult(book: ReadwiseBookInventoryItem): NativeReadwiseBookEpubLoadResult {
  return {
    book_key: book.bookKey,
    error_message: 'Could not load this original file. Please try another file.',
    epub_path: null,
    status: 'failed',
    title: book.title
  };
}
