import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { readSuperMemoXmlDraft } from '../../../../lib/core/import/superMemoXmlDraft';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSuperMemoPreviewArgs, SuperMemoSourceLink } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../config/appSettings';
import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from '../appSettingsState';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function selectRuntimeSuperMemoSource() {
  return requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, {});
}

export function loadRuntimeSuperMemoSourceLink() {
  return requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, { action: 'restore' });
}

export async function saveRuntimeSuperMemoSourceLink(link: SuperMemoSourceLink, formOnly: boolean) {
  await requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, { action: 'remember', link, formOnly });
}

export async function readRuntimeSuperMemoComparison() {
  const source = await requireInvoke()(NATIVE_COMMANDS.readSuperMemoSource, { action: 'comparison' });
  if (!source) throw new Error('supermemo_source_changed');
  return readSource(source.xml).elements;
}

export function selectRuntimeSuperMemoCollection(filePath: string, title: string, candidate?: string) {
  return requireInvoke()(NATIVE_COMMANDS.selectSuperMemoCollection, { filePath, title, ...(candidate ? { candidate } : {}) });
}

function requireInvoke() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('supermemo_import_unavailable');
  return invoke;
}

function readSource(xml: string, collectionDirectory?: string) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('invalid_supermemo_xml');
  let elements;
  try {
    elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
  } catch (error) {
    throw new Error('invalid_supermemo_xml', { cause: error });
  }
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

export async function previewRuntimeSuperMemoImport(xml: string, collectionDirectory: string | undefined, gradeMap: SuperMemoGradeMap, sourceFormat: SuperMemoSourceFormat, target?: SuperMemoUpdateTarget) {
  const source = readSource(xml, collectionDirectory);
  const preview = await requireInvoke()(NATIVE_COMMANDS.previewSuperMemoImport, { ...source, gradeMap, sourceFormat, ...target });
  return { preview, elements: source.elements };
}

export async function runRuntimeSuperMemoImport(filePath: string, percent: number,
  gradeMap: SuperMemoGradeMap, previewSignature: string, sourceFormat: SuperMemoSourceFormat, updateSignature?: string, withdrawSourceIds?: number[], target?: SuperMemoUpdateTarget, collectionChoice?: string | null) {
  const invoke = requireInvoke();
  const source = await invoke(NATIVE_COMMANDS.readSuperMemoSource, {
    filePath, ...(collectionChoice === undefined ? {} : { collectionDirectory: collectionChoice })
  });
  if (!source) throw new Error('supermemo_source_changed');
  return invoke(NATIVE_COMMANDS.runSuperMemoImport,
    { ...readSource(source.xml, source.collectionDirectory), percent, gradeMap, previewSignature, sourceFormat,
      ...(updateSignature ? { updateSignature } : {}), ...(withdrawSourceIds?.length ? { withdrawSourceIds } : {}), ...target });
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
