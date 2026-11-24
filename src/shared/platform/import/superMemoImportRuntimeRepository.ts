import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { readSuperMemoXmlBodies, readSuperMemoXmlDraft } from '../../../../lib/core/import/superMemoXmlDraft';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSuperMemoPreviewArgs, SuperMemoFolderChoice, SuperMemoMigrationPanel, SuperMemoMigrationSnapshot, SuperMemoSourceDraft, SuperMemoSourceLink, SuperMemoSourceSelection } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../config/appSettings';
import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from '../appSettingsState';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function pickRuntimeSuperMemoSource() {
  return requireInvoke()(NATIVE_COMMANDS.pickSuperMemoSource);
}

export function activateSavedRuntimeSuperMemoSource(filePath: string) {
  return requireInvoke()(NATIVE_COMMANDS.activateSavedSuperMemoSource, { filePath });
}

export function readRuntimeSuperMemoSource(filePath: string) {
  return requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, { filePath });
}

export async function getRuntimeSuperMemoSourceSelection(refreshDeletions = false) {
  return requireInvoke()(NATIVE_COMMANDS.getSuperMemoSourceSelection, refreshDeletions ? { refreshDeletions: true } : undefined);
}

export async function saveRuntimeSuperMemoPanel(source: SuperMemoSourceSelection, panel: SuperMemoMigrationPanel, snapshot?: SuperMemoMigrationSnapshot) {
  await requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource,
    { action: 'rememberPanel', filePath: source.filePath, collectionDirectory: source.collectionDirectory ?? null, panel, ...(snapshot ? { snapshot } : {}) });
}

export function reloadRuntimeSuperMemoSource() {
  return requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, { action: 'reload' });
}

export function checkRuntimeSuperMemoSource() {
  return requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, { action: 'check' });
}

export function readRuntimeRememberedSuperMemoSource(xmlOnly = false) {
  return requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, { action: 'restore', xmlOnly });
}

export async function saveRuntimeSuperMemoSourceLink(link: SuperMemoSourceLink, formOnly: boolean, snapshot?: SuperMemoMigrationSnapshot, xmlHash?: string) {
  await requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource,
    { action: 'remember', link, formOnly, ...(snapshot ? { snapshot } : {}), ...(xmlHash ? { xmlHash } : {}) });
}

export function selectRuntimeSuperMemoCollection(filePath: string, title: string, candidate?: string) {
  return requireInvoke()(NATIVE_COMMANDS.selectSuperMemoCollection, { filePath, title, ...(candidate ? { candidate } : {}) });
}

function requireInvoke() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('supermemo_import_unavailable');
  return invoke;
}

function parseSuperMemoXml<T>(xml: string, read: (document: Document) => T): T {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('supermemo_xml_doctype');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  // Chromium can insert a parser error into a partially parsed collection.
  if (document.documentElement?.localName === 'parsererror' ||
      document.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'parsererror').length > 0) {
    throw new Error('supermemo_xml_malformed');
  }
  try {
    return read(document);
  } catch (error) {
    throw new Error('invalid_supermemo_xml', { cause: error });
  }
}

export function parseRuntimeSuperMemoBodies(xml: string) {
  return parseSuperMemoXml(xml, readSuperMemoXmlBodies);
}

export function parseRuntimeSuperMemoSource(xml: string, collectionDirectory?: string) {
  const elements = parseSuperMemoXml(xml, readSuperMemoXmlDraft);
  return { elements, ...(collectionDirectory ? { collectionDirectory } : {}) };
}

const gradeKey = APP_SETTINGS_STORAGE_KEYS.superMemoGradeMap;

export async function loadSuperMemoGradeMap(): Promise<SuperMemoGradeMap> {
  const settings = await loadRuntimeAppSettingsState();
  try {
    const value: unknown = JSON.parse(settings?.[gradeKey] ?? 'null');
    if (Array.isArray(value) && value.length === 6 && value.every(grade => [1, 2, 3, 4].includes(grade))) {
      return value as SuperMemoGradeMap;
    }
  } catch {
    // Older settings may be absent or invalid.
  }
  return DEFAULT_SUPER_MEMO_GRADE_MAP;
}

export async function saveSuperMemoGradeMap(gradeMap: SuperMemoGradeMap) {
  if (!(await saveRuntimeAppSettingsState({ [gradeKey]: JSON.stringify(gradeMap) }))) {
    throw new Error('supermemo_grade_settings_unavailable');
  }
}

export type SuperMemoUpdateTarget = Pick<NativeSuperMemoPreviewArgs, 'targetBatchId' | 'originalElements'>;

export async function previewRuntimeSuperMemoImport(xml: string | SuperMemoSourceDraft['elements'], collectionDirectory: string | undefined, gradeMap: SuperMemoGradeMap, sourceFormat: SuperMemoSourceFormat, target?: SuperMemoUpdateTarget, folderChoices: SuperMemoFolderChoice[] = [], updatePercent?: number, priorityBoundaries?: readonly number[]) {
  const source = typeof xml === 'string' ? parseRuntimeSuperMemoSource(xml, collectionDirectory) : { elements: xml, ...(collectionDirectory ? { collectionDirectory } : {}) };
  const preview = await requireInvoke()(NATIVE_COMMANDS.previewSuperMemoImport, { ...source, gradeMap, sourceFormat, ...target, folderChoices, ...(priorityBoundaries ? { priorityBoundaries } : {}),
    ...(updatePercent !== undefined ? { updatePercent } : {}) });
  return { preview, elements: source.elements, folderChoices };
}

export function runRuntimeSuperMemoImport(args: NativeSuperMemoPreviewArgs & {
  percent: number; previewSignature: string; updateSignature?: string; ruleCorrectionsOnly?: true; withdrawSourceIds?: number[];
}) {
  return requireInvoke()(NATIVE_COMMANDS.runSuperMemoImport, args);
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
