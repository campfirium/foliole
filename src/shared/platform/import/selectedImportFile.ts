import { decodeTextFile } from '../../../../lib/core/import/decodeTextFile';
import { createPreparedDesktopTextImport } from '../../../../lib/core/import/fingerprint';

export type SelectedImportFile = Pick<File, 'name' | 'arrayBuffer'>;

/** File objects grant access to the selected bytes, never to an adjacent directory. */
export async function prepareSelectedTextImport(file: SelectedImportFile) {
  if (!/\.txt$/iu.test(file.name)) throw new Error('Unsupported file format.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const content = decodeTextFile(bytes).replace(/^\uFEFF/u, '');
  return createPreparedDesktopTextImport({
    content, fileName: file.name, filePath: file.name,
    sourceIdentity: crypto.randomUUID(), sourceTrackingMode: 'untracked',
    importedAt: new Date().toISOString(), kind: 'text'
  });
}
