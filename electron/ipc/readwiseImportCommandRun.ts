import { refreshReadwiseApiScheduler } from '../import/readwiseApiScheduler.js';
import { runReadwiseReaderImport } from '../import/readwiseReaderImportRun.js';

export async function runReadwiseImportCommand(
  input: Parameters<typeof runReadwiseReaderImport>[0]
) {
  try {
    return await runReadwiseReaderImport(input);
  } finally {
    refreshReadwiseApiScheduler();
  }
}
