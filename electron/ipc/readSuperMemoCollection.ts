import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { readSuperMemoBibliography, type SuperMemoBibliography } from '../../lib/core/import/superMemoBibliography.js';
import { matchSuperMemoCollection } from '../../lib/core/import/superMemoCollection.js';
import { readSuperMemoRegistryText } from '../../lib/core/import/superMemoRegistryText.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { isSameOrNestedPath } from '../libraryPathSafety.js';

import { assertAuthorizedImportDirectoryPath } from './importPathAuthorization.js';

async function readTable(root: string, name: string, folder = 'info') {
  const target = await realpath(path.join(root, folder, name));
  if (!isSameOrNestedPath(target, root)) throw new Error('invalid_supermemo_collection_path');
  const metadata = await stat(target);
  if (!metadata.isFile() || metadata.size > 32 * 1024 * 1024) throw new Error('invalid_supermemo_collection_file');
  const bytes = await readFile(target);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export async function readSuperMemoCollection(directory: string, elements: SuperMemoXmlDraftElement[]) {
  const root = await assertAuthorizedImportDirectoryPath(directory);
  const [tree, binary, repetitions, priorities, history] = await Promise.all(
    ['contents.dat', 'ElementInfo.dat', 'repetitions.dat', 'priority.sub', 'RepetitionHistory.dat'].map(name => readTable(root, name))
  );
  const fields = matchSuperMemoCollection(elements, { tree: tree!, elements: binary!, repetitions: repetitions!, priorities: priorities!, history: history! });
  const [groups, registry] = await Promise.all([readConceptGroups(root, elements, fields), readTextRegistry(root, fields)]);
  return { root, fields, groups, ...registry };
}

async function readConceptGroups(root: string, elements: SuperMemoXmlDraftElement[],
  fields: ReturnType<typeof matchSuperMemoCollection>) {
  const groupIds = new Set([...fields.values()].flatMap(field => field.conceptGroupId ? [field.conceptGroupId] : []));
  if (!groupIds.size) return new Map<number, number>();
  const tables = await Promise.all([
    readTable(root, 'Concept.ptr', 'registry'), readTable(root, 'concept.dat', 'registry')
  ] as const).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('supermemo_concept_registry_missing', { cause: error });
    }
    throw error;
  });
  const [pointers, records] = tables;
  if (pointers.byteLength % 4 || records.byteLength % 65) throw new Error('invalid_supermemo_concept_registry');
  const concepts = new Set(elements.filter(element => element.sourceType === 'Concept').map(element => element.id));
  const groups = new Map<number, number>();
  for (const groupId of groupIds) {
    if (groupId > pointers.byteLength / 4) continue;
    const slot = pointers.getUint32((groupId - 1) * 4, true);
    if (!slot || slot > records.byteLength / 65) continue;
    const offset = (slot - 1) * 65;
    const elementId = records.getUint32(offset, true);
    if (concepts.has(elementId)) groups.set(groupId, elementId);
  }
  return groups;
}

async function readOptionalRegistryTable(root: string, name: string) {
  try {
    return await readTable(root, name, 'registry');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readTextRegistry(root: string, fields: ReturnType<typeof matchSuperMemoCollection>) {
  const titles = new Map<number, string>();
  const ids = new Set([...fields.values()].flatMap(field => field.referenceId ? [field.referenceId] : []));
  let bibliography = new Map<number, SuperMemoBibliography>();
  if (!ids.size && ![...fields.values()].some(field => field.titleId)) return { titles, bibliography };
  const [members, text, references] = await Promise.all([
    readOptionalRegistryTable(root, 'Text.mem'), readOptionalRegistryTable(root, 'Text.rtx'),
    ids.size ? readOptionalRegistryTable(root, 'reference.dat') : null
  ]);
  if (!members || !text) return { titles, bibliography };
  if (members.byteLength % 30) throw new Error('invalid_supermemo_text_registry');
  for (const [id, field] of fields) {
    const title = readSuperMemoRegistryText(members, text, field.titleId);
    if (title) titles.set(id, title);
  }
  if (references) bibliography = readSuperMemoBibliography(ids, references, members, text);
  return { titles, bibliography };
}
