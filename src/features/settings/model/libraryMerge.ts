import type { NativeLibraryMergeResult, NativeLibraryMergeSource } from '../../../../lib/platform/nativeLibraryMergeContract';
import {
  mergeLibraryInRuntime,
  pickLibraryMergeAttachmentsInRuntime,
  pickLibraryMergeSourceInRuntime
} from '../../../shared/platform/databaseBackupRuntimeRepository';

export type LibraryMergeSource = NativeLibraryMergeSource;
export type LibraryMergeResult = NativeLibraryMergeResult;

export type LibraryMergeErrorKind = 'mobile' | 'current' | 'notLibrary' | 'other';

const ERROR_KINDS: Array<[string, LibraryMergeErrorKind]> = [
  ['library_merge_mobile_source_unsupported', 'mobile'],
  ['library_merge_source_is_current', 'current'],
  ['library_merge_source_not_library', 'notLibrary']
];

export function libraryMergeErrorKind(message: string): LibraryMergeErrorKind {
  return ERROR_KINDS.find(([code]) => message.includes(code))?.[1] ?? 'other';
}

export function libraryMergeSourceName(sourcePath: string) {
  return sourcePath.split(/[\\/]/).pop() || sourcePath;
}

export async function pickLibraryMergeSource(): Promise<LibraryMergeSource | null> {
  const value = await pickLibraryMergeSourceInRuntime();
  if (!value || typeof value !== 'object') return null;
  const { sourcePath, attachmentsDirectory } = value as Record<string, unknown>;
  if (typeof sourcePath !== 'string' || !sourcePath) return null;
  return { sourcePath, attachmentsDirectory: typeof attachmentsDirectory === 'string' ? attachmentsDirectory : null };
}

export async function pickLibraryMergeAttachments(defaultPath: string | null) {
  const value = await pickLibraryMergeAttachmentsInRuntime(defaultPath);
  return typeof value === 'string' && value ? value : null;
}

export async function mergeLibrary(source: LibraryMergeSource, folderTitle: string) {
  const result = await mergeLibraryInRuntime({ ...source, folderTitle });
  if (!result || typeof result !== 'object') throw new Error('Desktop runtime unavailable.');
  return result as LibraryMergeResult;
}
