import type { ReadwiseReaderImportProgressPayload } from '../../shared/platform/electronApi';

export interface ReadwiseImportProgressView {
  message: string;
  progress: number | null;
}

function progressFromPair(processed: number | undefined, total: number | undefined) {
  if (typeof processed !== 'number' || typeof total !== 'number' || total <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, processed / total));
}

function compactSourceName(sourcePath: string | null | undefined) {
  if (!sourcePath) {
    return null;
  }
  const parts = sourcePath.split(/[\\/]/u);
  return parts[parts.length - 1] || sourcePath;
}

function sourceSuffix(progress: ReadwiseReaderImportProgressPayload) {
  const sourceName = compactSourceName(progress.currentSourcePath);
  return sourceName ? ` ${sourceName}` : '';
}

function overallProgress(progress: ReadwiseReaderImportProgressPayload) {
  return progressFromPair(progress.sourceProcessedCount, progress.sourceTotalCount);
}

export function toReadwiseImportProgressView(
  progress: ReadwiseReaderImportProgressPayload | null
): ReadwiseImportProgressView | null {
  if (!progress) return null;
  if (progress.status === 'cancelled') {
    return {
      message: 'Cancelling Readwise import',
      progress: overallProgress(progress)
    };
  }
  if (progress.phase === 'indexing') {
    return {
      message: `Indexing${sourceSuffix(progress)}`,
      progress: overallProgress(progress)
    };
  }
  if (progress.phase === 'writing') {
    return {
      message: `Importing${sourceSuffix(progress)}`,
      progress: overallProgress(progress)
    };
  }
  return {
    message: progress.phase === 'scanning'
      ? `Scanning${sourceSuffix(progress)}`
      : `Importing${sourceSuffix(progress)}`,
    progress: overallProgress(progress)
  };
}
