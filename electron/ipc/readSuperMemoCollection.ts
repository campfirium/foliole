import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { matchSuperMemoCollection } from '../../lib/core/import/superMemoCollection.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { isSameOrNestedPath } from '../libraryPathSafety.js';

import { assertAuthorizedImportDirectoryPath } from './importPathAuthorization.js';

async function readTable(root: string, name: string) {
  const target = await realpath(path.join(root, 'info', name));
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
  return matchSuperMemoCollection(elements, { tree: tree!, elements: binary!, repetitions: repetitions!, priorities: priorities!, history: history! });
}
