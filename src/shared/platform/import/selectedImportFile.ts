import { createPreparedDesktopTextImport } from '../../../../lib/core/import/fingerprint';
import { resolveImportFileKind } from '../../../../lib/core/import/importFileKind';
import { formatImportImageDegradation, isUnmanagedImportImage } from '../../../../lib/core/import/importImagePolicy';
import { rewriteImportedImageReferences } from '../../../../lib/core/import/importImageReferences';
import { readTextFileImportPayload } from '../../../../lib/core/import/textFilePayload';

export type SelectedImportFile = Pick<File, 'name' | 'arrayBuffer'>;
export type SelectedImportWarning = 'images' | 'conversion';
export const SELECTED_TEXT_IMPORT_ACCEPT = '.txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html';

/** File objects grant access to the selected bytes, never to an adjacent directory. */
export async function prepareSelectedTextImport(file: SelectedImportFile) {
  const kind = resolveImportFileKind(file.name.slice(file.name.lastIndexOf('.')));
  if (kind === 'epub' || kind === 'pdf') throw new Error('Unsupported file format.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const payload = readTextFileImportPayload(bytes, kind);
  const prepared = createPreparedDesktopTextImport({
    ...payload, fileName: file.name, filePath: file.name,
    sourceIdentity: crypto.randomUUID(), sourceTrackingMode: 'untracked',
    importedAt: new Date().toISOString(), kind
  });
  if (kind === 'text') return { ...prepared, importWarning: undefined };
  const rewritten = rewriteImportedImageReferences(prepared.content, reference =>
    isUnmanagedImportImage(reference.destination, reference.syntax)
      ? { status: 'error', message: `Missing local image: ${reference.destination}` } : { status: 'skipped' });
  const reason = formatImportImageDegradation(kind, rewritten.degradedMessages);
  const degradedReason = [prepared.degradedReason, reason].filter(Boolean).join('; ') || null;
  const importWarning: SelectedImportWarning | undefined = reason ? 'images' : degradedReason ? 'conversion' : undefined;
  return { ...prepared, content: rewritten.content, degradedReason, importWarning };
}
