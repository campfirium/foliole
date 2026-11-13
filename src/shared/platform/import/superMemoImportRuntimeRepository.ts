import { readSuperMemoXmlDraft } from '../../../../lib/core/import/superMemoXmlDraft';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function selectRuntimeSuperMemoCollection() {
  return requireInvoke()(NATIVE_COMMANDS.selectImportDirectory, {});
}

function requireInvoke() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('supermemo_import_unavailable');
  return invoke;
}

async function readSource(file: File, collectionDirectory?: string) {
  const xml = await file.text();
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('invalid_supermemo_xml');
  const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
  return { elements, ...(collectionDirectory ? { collectionDirectory } : {}) };
}

export async function previewRuntimeSuperMemoImport(file: File, collectionDirectory?: string) {
  return requireInvoke()(NATIVE_COMMANDS.previewSuperMemoImport, await readSource(file, collectionDirectory));
}

export async function runRuntimeSuperMemoImport(file: File, percent: number, collectionDirectory?: string) {
  return requireInvoke()(NATIVE_COMMANDS.runSuperMemoImport, { ...await readSource(file, collectionDirectory), percent });
}

export function listRuntimeSuperMemoImports() {
  return requireInvoke()(NATIVE_COMMANDS.listSuperMemoImports);
}

export function adjustRuntimeSuperMemoImport(batchId: string, percent: number) {
  return requireInvoke()(NATIVE_COMMANDS.adjustSuperMemoImport, { batchId, percent });
}

export function previewRuntimeSuperMemoAdjustment(batchId: string, percent: number) {
  return requireInvoke()(NATIVE_COMMANDS.previewSuperMemoAdjustment, { batchId, percent });
}
